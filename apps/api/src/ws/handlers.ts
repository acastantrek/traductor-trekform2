import { isLanguage, WS_CLOSE } from '@ct/shared';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { z } from 'zod';
import type { AuthVerifier } from '../db/types.js';
import type { SessionRegistry } from '../domain/registry.js';
import type { StudentClient, TeacherClient } from '../domain/session.js';

const HEARTBEAT_MS = 25_000;
const HELLO_TIMEOUT_MS = 5000;
// Por encima de esto el cliente no está leyendo: mejor cortar y que reconecte con buffer.
const MAX_BUFFERED_BYTES = 1024 * 1024;

const teacherMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), token: z.string().max(4096) }),
  z.object({ type: z.literal('audio.start'), sampleRate: z.number().int().min(8000).max(96000) }),
  z.object({ type: z.literal('audio.stop') }),
]);

const studentMessage = z.object({ type: z.literal('language.set'), language: z.string() });

function parseJson(raw: WebSocket.RawData): unknown {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return undefined;
  }
}

function heartbeat(socket: WebSocket) {
  let alive = true;
  socket.on('pong', () => (alive = true));
  const timer = setInterval(() => {
    if (!alive) return socket.terminate();
    alive = false;
    socket.ping();
  }, HEARTBEAT_MS);
  socket.on('close', () => clearInterval(timer));
}

function sender(socket: WebSocket) {
  return (event: unknown) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) return socket.terminate();
    socket.send(JSON.stringify(event));
  };
}

export function registerWebSockets(app: FastifyInstance, registry: SessionRegistry, auth: AuthVerifier) {
  app.get('/ws/teacher/:id', { websocket: true }, (socket, req) => {
    const { id } = req.params as { id: string };
    const session = registry.get(id);
    if (!session) return socket.close(WS_CLOSE.notFound, 'session not found');
    heartbeat(socket);

    const client: TeacherClient = { send: sender(socket) };
    let authed = false;
    let authenticating = false;
    // Último audio.start/stop recibido mientras se verificaba el token.
    let pendingAudio: { sampleRate?: number } | undefined;
    const applyAudio = (msg: { sampleRate?: number }) =>
      msg.sampleRate ? session.audioStart(msg.sampleRate) : session.audioStop();
    const helloTimer = setTimeout(() => {
      if (!authed) socket.close(WS_CLOSE.unauthorized, 'hello timeout');
    }, HELLO_TIMEOUT_MS);

    socket.on('message', (raw, isBinary) => {
      if (isBinary) {
        if (authed)
          session.audio(
            Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw),
          );
        return;
      }
      const msg = teacherMessage.safeParse(parseJson(raw));
      if (!msg.success) return socket.close(WS_CLOSE.badRequest, 'invalid message');
      if (msg.data.type === 'hello') {
        if (authed || authenticating) return;
        authenticating = true;
        void auth.verify(msg.data.token).then(
          (user) => {
            authenticating = false;
            if (socket.readyState !== WebSocket.OPEN) return;
            if (!user || !session.canControl(user))
              return socket.close(WS_CLOSE.unauthorized, 'invalid token');
            authed = true;
            clearTimeout(helloTimer);
            session.addTeacher(client);
            if (pendingAudio) applyAudio(pendingAudio);
            pendingAudio = undefined;
          },
          () => socket.close(WS_CLOSE.unauthorized, 'auth unavailable'),
        );
        return;
      }
      const audio = msg.data.type === 'audio.start' ? { sampleRate: msg.data.sampleRate } : {};
      if (authenticating) {
        pendingAudio = audio;
        return;
      }
      if (!authed) return socket.close(WS_CLOSE.unauthorized, 'hello required');
      applyAudio(audio);
    });
    socket.on('close', () => {
      clearTimeout(helloTimer);
      if (authed) session.removeTeacher(client);
    });
  });

  app.get('/ws/student/:id', { websocket: true }, (socket, req) => {
    const { id } = req.params as { id: string };
    const query = req.query as { lang?: string; since?: string };
    const session = registry.get(id);
    if (!session) return socket.close(WS_CLOSE.notFound, 'session not found');
    const language = query.lang;
    if (!isLanguage(language) || !session.allowedLanguages.includes(language))
      return socket.close(WS_CLOSE.badRequest, 'language not allowed');
    const since = Math.max(0, Number.parseInt(query.since ?? '0', 10) || 0);

    const client: StudentClient = {
      send: sender(socket),
      close: (code, reason) => socket.close(code, reason),
    };
    const result = session.addStudent(client, language, since);
    if (result === 'ended') return socket.close(WS_CLOSE.ended, 'session ended');
    if (result === 'full') return socket.close(WS_CLOSE.full, 'session full');
    heartbeat(socket);

    socket.on('message', (raw, isBinary) => {
      if (isBinary) return socket.close(WS_CLOSE.badRequest, 'binary not allowed');
      const msg = studentMessage.safeParse(parseJson(raw));
      const next = msg.success ? msg.data.language : undefined;
      if (!isLanguage(next) || !session.allowedLanguages.includes(next))
        return socket.close(WS_CLOSE.badRequest, 'invalid message');
      session.setStudentLanguage(client, next);
    });
    socket.on('close', () => session.removeStudent(client));
  });
}
