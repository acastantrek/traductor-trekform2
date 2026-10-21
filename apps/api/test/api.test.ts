import { randomUUID } from 'node:crypto';
import type { Course, StudentServerEvent, TeacherSession } from '@ct/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { AuthUser } from '../src/db/types.js';
import { FakeAuth, FakeStt, FakeTranslator, flush, MemoryRepository } from './helpers.js';

let app: Awaited<ReturnType<typeof buildApp>>['app'];
let base: string;
let stt: FakeStt;
let translator: FakeTranslator;
let repo: MemoryRepository;
let admin: AuthUser;
let teacher: AuthUser;
let outsider: AuthUser;

beforeEach(async () => {
  stt = new FakeStt();
  translator = new FakeTranslator();
  repo = new MemoryRepository();
  admin = repo.addUser('admin');
  teacher = repo.addUser('teacher', 'ana');
  outsider = repo.addUser('teacher', 'otro');
  const config = loadConfig({
    LANGUAGE_GRACE_MS: '50',
    SUPABASE_URL: 'http://127.0.0.1:1',
    SUPABASE_SECRET_KEY: 'test',
  });
  ({ app } = await buildApp({ config, stt, translator, repo, auth: new FakeAuth(repo.users), logger: false }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  base = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
});

afterEach(async () => {
  await app.close();
});

function call(method: string, path: string, user?: AuthUser, body?: unknown) {
  return fetch(`http://${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(user ? { Authorization: `Bearer ${user.id}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createCourse(teacherIds = [teacher.id]): Promise<Course> {
  const res = await call('POST', '/api/courses', admin, {
    name: 'Seguridad en taller',
    sourceLanguage: 'es',
    targetLanguages: ['en', 'fr', 'es'],
    teacherIds,
  });
  expect(res.status).toBe(201);
  return (await res.json()) as Course;
}

async function createSession(user = teacher): Promise<TeacherSession> {
  const course = await createCourse();
  const res = await call('POST', '/api/sessions', user, { courseId: course.id });
  expect(res.status).toBe(201);
  return (await res.json()) as TeacherSession;
}

function connect(path: string) {
  const ws = new WebSocket(`ws://${base}${path}`);
  const messages: unknown[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  const opened = new Promise<void>((resolve, reject) => {
    ws.on('open', () => resolve());
    ws.on('error', reject);
  });
  return { ws, messages, closed, opened };
}

describe('Auth y cursos', () => {
  it('exige login y rol admin donde corresponde', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401);
    expect(await (await call('GET', '/api/me', teacher)).json()).toMatchObject({ id: teacher.id, role: 'teacher' });
    expect((await call('GET', '/api/teachers', teacher)).status).toBe(403);
    expect((await call('POST', '/api/courses', teacher, {})).status).toBe(403);
    expect((await call('GET', '/api/teachers', admin)).status).toBe(200);
  });

  it('FR-01: el admin crea cursos; el idioma de origen se quita de los destinos y solo es/ca', async () => {
    const course = await createCourse();
    expect(course.targetLanguages).toEqual(['en', 'fr']);
    const bad = await call('POST', '/api/courses', admin, {
      name: 'X',
      sourceLanguage: 'en',
      targetLanguages: ['fr'],
    });
    expect(bad.status).toBe(400);
  });

  it('cada profesor ve solo sus cursos; el admin ve todos', async () => {
    await createCourse([teacher.id]);
    await createCourse([outsider.id]);
    expect(await (await call('GET', '/api/courses', teacher)).json()).toHaveLength(1);
    expect(await (await call('GET', '/api/courses', admin)).json()).toHaveLength(2);
  });

  it('solo el admin elimina cursos, y no con una clase abierta', async () => {
    const course = await createCourse();
    const path = `/api/courses/${course.id}`;
    expect((await call('DELETE', path)).status).toBe(401);
    expect((await call('DELETE', path, teacher)).status).toBe(403);
    const res = await call('POST', '/api/sessions', teacher, { courseId: course.id });
    const session = (await res.json()) as TeacherSession;
    expect((await call('DELETE', path, admin)).status).toBe(409);
    expect((await call('POST', `/api/sessions/${session.id}/end`, teacher)).status).toBe(200);
    expect((await call('DELETE', path, admin)).status).toBe(204);
    expect(await (await call('GET', '/api/courses', admin)).json()).toEqual([]);
    expect((await call('DELETE', path, admin)).status).toBe(404);
    expect((await call('DELETE', '/api/courses/no-es-uuid', admin)).status).toBe(404);
  });

  it('solo el admin edita profesores; no admins ni emails duplicados', async () => {
    const path = (id: string) => `/api/teachers/${id}`;
    const body = { fullName: 'Ana Pérez', email: 'ANA.PEREZ@test.local ' };
    expect((await call('PATCH', path(teacher.id), undefined, body)).status).toBe(401);
    expect((await call('PATCH', path(teacher.id), teacher, body)).status).toBe(403);
    const res = await call('PATCH', path(teacher.id), admin, body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ fullName: 'Ana Pérez', email: 'ana.perez@test.local', role: 'teacher' });
    expect((await call('PATCH', path(teacher.id), admin, { ...body, email: outsider.email })).status).toBe(409);
    expect((await call('PATCH', path(teacher.id), admin, { ...body, fullName: ' ' })).status).toBe(400);
    expect((await call('PATCH', path(admin.id), admin, body)).status).toBe(404);
    expect((await call('PATCH', path(randomUUID()), admin, body)).status).toBe(404);
  });

  it('solo el admin elimina profesores, no admins ni con una clase abierta', async () => {
    const course = await createCourse([teacher.id, outsider.id]);
    const path = (id: string) => `/api/teachers/${id}`;
    expect((await call('DELETE', path(teacher.id), teacher)).status).toBe(403);
    expect((await call('DELETE', path(admin.id), admin)).status).toBe(404);
    const res = await call('POST', '/api/sessions', teacher, { courseId: course.id });
    const session = (await res.json()) as TeacherSession;
    expect((await call('DELETE', path(teacher.id), admin)).status).toBe(409);
    expect((await call('POST', `/api/sessions/${session.id}/end`, teacher)).status).toBe(200);
    expect((await call('DELETE', path(teacher.id), admin)).status).toBe(204);
    expect(repo.courses.get(course.id)?.teacherIds).toEqual([outsider.id]);
    expect(repo.sessions.has(session.id)).toBe(false);
    expect((await call('DELETE', path(teacher.id), admin)).status).toBe(404);
  });

  it('el admin crea profesores y no permite emails duplicados', async () => {
    const body = { email: 'nuevo@test.local', fullName: 'Nuevo', password: 'contraseña-segura' };
    expect((await call('POST', '/api/teachers', admin, body)).status).toBe(201);
    expect((await call('POST', '/api/teachers', admin, body)).status).toBe(409);
    expect((await call('POST', '/api/teachers', admin, { ...body, password: 'corta' })).status).toBe(400);
  });

  it('solo el admin cambia contraseñas, de profesores y de admins', async () => {
    const path = (id: string) => `/api/teachers/${id}/password`;
    const body = { password: 'otra-contraseña' };
    expect((await call('PUT', path(teacher.id), undefined, body)).status).toBe(401);
    expect((await call('PUT', path(teacher.id), teacher, body)).status).toBe(403);
    expect((await call('PUT', path(teacher.id), admin, body)).status).toBe(204);
    expect((await call('PUT', path(admin.id), admin, body)).status).toBe(204);
    expect(repo.passwords.get(teacher.id)).toBe('otra-contraseña');
    expect(repo.passwords.get(admin.id)).toBe('otra-contraseña');
    expect((await call('PUT', path(teacher.id), admin, { password: 'corta' })).status).toBe(400);
    expect((await call('PUT', path(randomUUID()), admin, body)).status).toBe(404);
    expect((await call('PUT', path('no-es-uuid'), admin, body)).status).toBe(404);
  });
});

describe('Sesiones', () => {
  it('FR-02: solo los profesores del curso pueden crear sesiones y toman los idiomas del curso', async () => {
    const course = await createCourse();
    expect((await call('POST', '/api/sessions', outsider, { courseId: course.id })).status).toBe(403);
    const res = await call('POST', '/api/sessions', teacher, { courseId: course.id });
    const session = (await res.json()) as TeacherSession;
    expect(session).toMatchObject({ courseId: course.id, teacherId: teacher.id, targetLanguages: ['en', 'fr'] });
    expect(repo.sessions.get(session.id)?.status).toBe('ready');
    const open = (await (await call('GET', '/api/sessions', teacher)).json()) as TeacherSession[];
    expect(open.map((s) => s.id)).toEqual([session.id]);
    expect(await (await call('GET', '/api/sessions', outsider)).json()).toEqual([]);
  });

  it('solo el profesor de la sesión (o admin) la controla, y los estados se guardan', async () => {
    const session = await createSession();
    expect((await call('POST', `/api/sessions/${session.id}/start`)).status).toBe(401);
    expect((await call('POST', `/api/sessions/${session.id}/start`, outsider)).status).toBe(403);
    expect((await call('POST', `/api/sessions/${session.id}/pause`, teacher)).status).toBe(409);
    expect((await call('POST', `/api/sessions/${session.id}/start`, teacher)).status).toBe(200);
    expect((await call('POST', `/api/sessions/${session.id}/pause`, admin)).status).toBe(200);
    await flush();
    expect(repo.sessions.get(session.id)?.status).toBe('paused');
  });

  it('flujo completo: profesor emite audio, dos alumnos en inglés reciben una sola traducción y se guardan métricas', async () => {
    const session = await createSession();
    const t = connect(`/ws/teacher/${session.id}`);
    await t.opened;
    t.ws.send(JSON.stringify({ type: 'hello', token: teacher.id }));
    t.ws.send(JSON.stringify({ type: 'audio.start', sampleRate: 16000 }));

    const a = connect(`/ws/student/${session.id}?lang=en`);
    const b = connect(`/ws/student/${session.id}?lang=en`);
    const f = connect(`/ws/student/${session.id}?lang=fr`);
    await Promise.all([a.opened, b.opened, f.opened]);

    expect((await call('POST', `/api/sessions/${session.id}/start`, teacher)).status).toBe(200);
    await flush();
    t.ws.send(Buffer.alloc(3200));
    await flush();
    expect(stt.bytes).toBe(3200);

    stt.emit({ text: 'Revisad el equipo.' });
    await flush();
    await flush();

    const subtitles = (m: unknown[]) =>
      (m as StudentServerEvent[]).filter((e) => e.type === 'subtitle.final').map((e) => e.type === 'subtitle.final' && e.text);
    expect(subtitles(a.messages)).toEqual(['en:Revisad el equipo.']);
    expect(subtitles(b.messages)).toEqual(['en:Revisad el equipo.']);
    expect(subtitles(f.messages)).toEqual(['fr:Revisad el equipo.']);
    expect(translator.calls.filter((c) => c.target === 'en')).toHaveLength(1);
    expect(t.messages).toContainEqual({ type: 'transcript.final', sequence: 1, text: 'Revisad el equipo.' });

    expect((await call('POST', `/api/sessions/${session.id}/end`, teacher)).status).toBe(200);
    expect(await a.closed).toBe(4410);
    await flush();
    expect(repo.sessions.get(session.id)?.status).toBe('ended');
    expect(repo.metrics.get(session.id)).toMatchObject({ segments: 1, translations: 2, peakStudents: 3 });
    t.ws.close();
  });

  it('rechaza alumnos con idioma no permitido, sesiones inexistentes y profesores ajenos', async () => {
    const session = await createSession();
    expect(await connect(`/ws/student/${session.id}?lang=de`).closed).toBe(4400);
    expect(await connect(`/ws/student/nope?lang=en`).closed).toBe(4404);
    for (const token of ['wrong', outsider.id]) {
      const t = connect(`/ws/teacher/${session.id}`);
      await t.opened;
      t.ws.send(JSON.stringify({ type: 'hello', token }));
      expect(await t.closed).toBe(4401);
    }
  });
});
