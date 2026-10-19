import {
  LANGUAGE_CODES,
  MAX_TARGET_LANGUAGES,
  SOURCE_LANGUAGES,
  type Language,
  type SessionAction,
} from '@ct/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { SessionRegistry } from '../domain/registry.js';
import { ConflictError, type AuthVerifier, type Repository } from '../db/types.js';

const language = z.enum(LANGUAGE_CODES as [Language, ...Language[]]);
const uuid = z.string().uuid();

const courseSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    sourceLanguage: z.enum(SOURCE_LANGUAGES),
    targetLanguages: z.array(language).min(1).max(MAX_TARGET_LANGUAGES),
    teacherIds: z.array(uuid).max(50).default([]),
  })
  .transform((v) => ({
    ...v,
    targetLanguages: [...new Set(v.targetLanguages)].filter((l) => l !== v.sourceLanguage),
    teacherIds: [...new Set(v.teacherIds)],
  }))
  .refine((v) => v.targetLanguages.length > 0, {
    message: 'Debe haber al menos un idioma de destino distinto del de origen',
  });

const teacherSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
});

const idParams = z.object({ id: z.string().min(1).max(64) });

function fail(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.status(status).send({ error, message });
}

export interface RouteDeps {
  registry: SessionRegistry;
  repo: Repository;
  auth: AuthVerifier;
  providers: { stt: string; translation: string };
}

export function registerRoutes(app: FastifyInstance, { registry, repo, auth, providers }: RouteDeps) {
  /** Devuelve el usuario o responde 401/403 y devuelve null. */
  async function requireUser(req: FastifyRequest, reply: FastifyReply, role?: 'admin') {
    const h = req.headers.authorization;
    const user = h?.startsWith('Bearer ') ? await auth.verify(h.slice(7)) : null;
    if (!user) {
      fail(reply, 401, 'unauthorized', 'Inicia sesión para continuar');
      return null;
    }
    if (role && user.role !== role) {
      fail(reply, 403, 'forbidden', 'No tienes permisos para esta acción');
      return null;
    }
    return user;
  }

  app.setErrorHandler((err: Error & { statusCode?: number; error?: string }, _req, reply) => {
    if (err instanceof ConflictError) return fail(reply, 409, 'conflict', err.message);
    // Errores de cliente de Fastify y plugins (JSON inválido, body grande, rate limit…): se respetan.
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500)
      return fail(reply, err.statusCode, err.error ?? 'bad_request', err.message);
    app.log.error(err);
    return fail(reply, 500, 'internal', 'Error interno');
  });

  app.get('/api/health', async () => ({ ok: true, providers, sessions: registry.size }));

  app.get('/api/me', async (req, reply) => {
    const user = await requireUser(req, reply);
    return user ?? reply;
  });

  // ---------- Profesores (admin) ----------

  app.get('/api/teachers', async (req, reply) => {
    if (!(await requireUser(req, reply, 'admin'))) return reply;
    return repo.listTeachers();
  });

  app.post('/api/teachers', async (req, reply) => {
    if (!(await requireUser(req, reply, 'admin'))) return reply;
    const parsed = teacherSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'invalid_body', parsed.error.issues[0]?.message ?? 'Datos no válidos');
    return reply.status(201).send(await repo.createTeacher(parsed.data));
  });

  // ---------- Cursos (FR-01) ----------

  app.get('/api/courses', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    return repo.listCourses(user);
  });

  app.post('/api/courses', async (req, reply) => {
    const user = await requireUser(req, reply, 'admin');
    if (!user) return reply;
    const parsed = courseSchema.safeParse(req.body);
    if (!parsed.success) return fail(reply, 400, 'invalid_body', parsed.error.issues[0]?.message ?? 'Datos no válidos');
    return reply.status(201).send(await repo.createCourse(parsed.data, user.id));
  });

  app.patch('/api/courses/:id', async (req, reply) => {
    if (!(await requireUser(req, reply, 'admin'))) return reply;
    const params = z.object({ id: uuid }).safeParse(req.params);
    const parsed = courseSchema.safeParse(req.body);
    if (!params.success) return fail(reply, 404, 'not_found', 'El curso no existe');
    if (!parsed.success) return fail(reply, 400, 'invalid_body', parsed.error.issues[0]?.message ?? 'Datos no válidos');
    const course = await repo.updateCourse(params.data.id, parsed.data);
    return course ?? fail(reply, 404, 'not_found', 'El curso no existe');
  });

  // ---------- Sesiones (FR-02, FR-13, FR-14) ----------

  app.get('/api/sessions', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    return registry.openFor(user).map((s) => s.teacherView());
  });

  app.post('/api/sessions', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return reply;
    const body = z.object({ courseId: uuid }).safeParse(req.body);
    const course = body.success ? await repo.getCourse(body.data.courseId) : null;
    if (!course) return fail(reply, 404, 'not_found', 'El curso no existe');
    if (user.role !== 'admin' && !course.teacherIds.includes(user.id))
      return fail(reply, 403, 'forbidden', 'No eres profesor de este curso');
    if (registry.full) return fail(reply, 503, 'capacity', 'Se ha alcanzado el máximo de sesiones');

    const session = registry.create({
      courseId: course.id,
      teacherId: user.id,
      title: course.name,
      sourceLanguage: course.sourceLanguage,
      targetLanguages: course.targetLanguages,
    });
    try {
      await repo.createSession({
        id: session.id,
        courseId: course.id,
        teacherId: user.id,
        sourceLanguage: course.sourceLanguage,
        targetLanguages: course.targetLanguages,
      });
    } catch (err) {
      registry.discard(session.id);
      throw err;
    }
    return reply.status(201).send(session.teacherView());
  });

  app.get('/api/sessions/:id/public', async (req, reply) => {
    const params = idParams.safeParse(req.params);
    const session = params.success ? registry.get(params.data.id) : undefined;
    if (!session) return fail(reply, 404, 'not_found', 'La sesión no existe o ha caducado');
    return session.public();
  });

  for (const action of ['start', 'pause', 'resume', 'end'] satisfies SessionAction[]) {
    app.post(`/api/sessions/:id/${action}`, async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return reply;
      const params = idParams.safeParse(req.params);
      const session = params.success ? registry.get(params.data.id) : undefined;
      if (!session) return fail(reply, 404, 'not_found', 'La sesión no existe o ha caducado');
      if (!session.canControl(user)) return fail(reply, 403, 'forbidden', 'Esta sesión es de otro profesor');
      if (!session.transition(action))
        return fail(reply, 409, 'invalid_transition', `No se puede ${action} una sesión en estado ${session.status}`);
      return session.teacherView();
    });
  }
}
