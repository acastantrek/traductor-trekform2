import {
  LANGUAGE_CODES,
  MAX_TARGET_LANGUAGES,
  type CreateSessionResponse,
  type SessionAction,
} from '@ct/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { SessionRegistry } from '../domain/registry.js';

const language = z.enum(LANGUAGE_CODES as [string, ...string[]]);

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    sourceLanguage: language,
    targetLanguages: z.array(language).min(1).max(MAX_TARGET_LANGUAGES),
  })
  .transform((v) => ({
    ...v,
    targetLanguages: [...new Set(v.targetLanguages)].filter((l) => l !== v.sourceLanguage),
  }))
  .refine((v) => v.targetLanguages.length > 0, {
    message: 'Debe haber al menos un idioma de destino distinto del de origen',
  });

const idParams = z.object({ id: z.string().min(1).max(64) });

function fail(reply: FastifyReply, status: number, error: string, message: string) {
  return reply.status(status).send({ error, message });
}

function bearer(req: FastifyRequest) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : '';
}

export function registerRoutes(app: FastifyInstance, registry: SessionRegistry, providers: { stt: string; translation: string }) {
  app.get('/api/health', async () => ({ ok: true, providers, sessions: registry.size }));

  app.post('/api/sessions', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      return fail(reply, 400, 'invalid_body', parsed.error.issues[0]?.message ?? 'Datos no válidos');
    const created = registry.create(parsed.data as Parameters<SessionRegistry['create']>[0]);
    if (!created) return fail(reply, 503, 'capacity', 'Se ha alcanzado el máximo de sesiones');
    const body: CreateSessionResponse = {
      session: created.session.public(),
      teacherToken: created.teacherToken,
    };
    return reply.status(201).send(body);
  });

  app.get('/api/sessions/:id/public', async (req, reply) => {
    const params = idParams.safeParse(req.params);
    const session = params.success ? registry.get(params.data.id) : undefined;
    if (!session) return fail(reply, 404, 'not_found', 'La sesión no existe o ha caducado');
    return session.public();
  });

  for (const action of ['start', 'pause', 'resume', 'end'] satisfies SessionAction[]) {
    app.post(`/api/sessions/:id/${action}`, async (req, reply) => {
      const params = idParams.safeParse(req.params);
      const session = params.success ? registry.get(params.data.id) : undefined;
      if (!session) return fail(reply, 404, 'not_found', 'La sesión no existe o ha caducado');
      if (!session.verifyTeacher(bearer(req)))
        return fail(reply, 401, 'unauthorized', 'Token de profesor no válido');
      if (!session.transition(action))
        return fail(reply, 409, 'invalid_transition', `No se puede ${action} una sesión en estado ${session.status}`);
      return { session: session.public() };
    });
  }
}
