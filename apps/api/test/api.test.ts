import type { CreateSessionResponse, StudentServerEvent } from '@ct/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { FakeStt, FakeTranslator, flush } from './helpers.js';

let app: Awaited<ReturnType<typeof buildApp>>['app'];
let base: string;
let stt: FakeStt;
let translator: FakeTranslator;

beforeEach(async () => {
  stt = new FakeStt();
  translator = new FakeTranslator();
  const config = loadConfig({ LANGUAGE_GRACE_MS: '50' });
  ({ app } = await buildApp({ config, stt, translator, logger: false }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  base = typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
});

afterEach(async () => {
  await app.close();
});

async function createSession(): Promise<CreateSessionResponse> {
  const res = await fetch(`http://${base}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Seguridad', sourceLanguage: 'es', targetLanguages: ['en', 'fr', 'es'] }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as CreateSessionResponse;
}

function action(id: string, name: string, token: string) {
  return fetch(`http://${base}/api/sessions/${id}/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
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

describe('API + WebSocket', () => {
  it('valida la creación de sesiones y quita el idioma de origen de los destinos', async () => {
    const bad = await fetch(`http://${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', sourceLanguage: 'es', targetLanguages: [] }),
    });
    expect(bad.status).toBe(400);
    const { session, teacherToken } = await createSession();
    expect(session.targetLanguages).toEqual(['en', 'fr']);
    expect(teacherToken.length).toBeGreaterThan(20);
    const pub = await fetch(`http://${base}/api/sessions/${session.id}/public`);
    expect(await pub.json()).toEqual(session);
  });

  it('exige token de profesor para controlar la sesión', async () => {
    const { session, teacherToken } = await createSession();
    expect((await action(session.id, 'start', 'nope')).status).toBe(401);
    expect((await action(session.id, 'pause', teacherToken)).status).toBe(409);
    expect((await action(session.id, 'start', teacherToken)).status).toBe(200);
    expect((await action('missing', 'start', teacherToken)).status).toBe(404);
  });

  it('flujo completo: profesor emite audio y dos alumnos en inglés reciben una sola traducción', async () => {
    const { session, teacherToken } = await createSession();
    const teacher = connect(`/ws/teacher/${session.id}`);
    await teacher.opened;
    teacher.ws.send(JSON.stringify({ type: 'hello', token: teacherToken }));
    teacher.ws.send(JSON.stringify({ type: 'audio.start', sampleRate: 16000 }));

    const a = connect(`/ws/student/${session.id}?lang=en`);
    const b = connect(`/ws/student/${session.id}?lang=en`);
    const f = connect(`/ws/student/${session.id}?lang=fr`);
    await Promise.all([a.opened, b.opened, f.opened]);

    expect((await action(session.id, 'start', teacherToken)).status).toBe(200);
    await flush();
    teacher.ws.send(Buffer.alloc(3200));
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
    expect(teacher.messages).toContainEqual({ type: 'transcript.final', sequence: 1, text: 'Revisad el equipo.' });

    expect((await action(session.id, 'end', teacherToken)).status).toBe(200);
    expect(await a.closed).toBe(4410);
    teacher.ws.close();
  });

  it('rechaza alumnos con idioma no permitido, sesiones inexistentes y profesores sin token válido', async () => {
    const { session } = await createSession();
    expect(await connect(`/ws/student/${session.id}?lang=de`).closed).toBe(4400);
    expect(await connect(`/ws/student/nope?lang=en`).closed).toBe(4404);
    const teacher = connect(`/ws/teacher/${session.id}`);
    await teacher.opened;
    teacher.ws.send(JSON.stringify({ type: 'hello', token: 'wrong' }));
    expect(await teacher.closed).toBe(4401);
  });
});
