import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import type { SessionStatus } from '@ct/shared';
import Fastify from 'fastify';
import type { Config } from './config.js';
import type { AuthVerifier, Repository } from './db/types.js';
import { SessionRegistry } from './domain/registry.js';
import type { Session } from './domain/session.js';
import { registerRoutes } from './http/routes.js';
import type { SpeechToTextProvider, TranslationProvider } from './providers/types.js';
import { registerWebSockets } from './ws/handlers.js';

export interface AppDeps {
  config: Config;
  stt: SpeechToTextProvider;
  translator: TranslationProvider;
  repo: Repository;
  auth: AuthVerifier;
  logger?: boolean;
}

export async function buildApp({ config, stt, translator, repo, auth, logger = true }: AppDeps) {
  const app = Fastify({
    // NFR-09/§10: no registrar contenido; solo método, ruta y estado.
    logger: logger
      ? {
          serializers: {
            req: (req: { method: string; url: string }) => ({
              method: req.method,
              url: req.url.split('?')[0],
            }),
          },
        }
      : false,
    bodyLimit: 16 * 1024,
    // Confía solo en los N saltos de proxy más cercanos (equivale a trustProxy: N).
    trustProxy: (_address: string, hop: number) => hop < config.trustProxy,
  });

  // Escrituras de estado en orden por sesión, sin bloquear el pipeline realtime.
  const writes = new Map<string, Promise<void>>();
  const pending = new Set<Promise<void>>();
  const persistStatus = (session: Session, status: SessionStatus) => {
    const previous = writes.get(session.id) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        await repo.updateSessionStatus(session.id, status);
        if (status === 'ended') await repo.saveSessionMetrics(session.id, session.metrics());
      })
      .catch((err: unknown) => app.log.error({ err, sessionId: session.id }, 'No se pudo persistir la sesión'))
      .finally(() => {
        pending.delete(next);
        if (writes.get(session.id) === next) writes.delete(session.id);
      });
    writes.set(session.id, next);
    pending.add(next);
  };

  const registry = new SessionRegistry({ stt, translator, onStatus: persistStatus }, config.session);

  // API solo JSON/WS: cabeceras estrictas; la CSP de la web la sirve su propio hosting.
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"] } } });
  // Por defecto @fastify/cors solo permite GET/HEAD/POST: sin esto, editar cursos (PATCH) falla desde otro origen.
  await app.register(cors, { origin: config.allowedOrigins, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH'] });
  await app.register(rateLimit, {
    max: config.rateLimitPerMinute,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: 'rate_limited',
      message: `Demasiadas peticiones. Reintenta en ${Math.ceil(ctx.ttl / 1000)} s.`,
    }),
  });
  await app.register(websocket, { options: { maxPayload: 256 * 1024 } });

  registerRoutes(app, {
    registry,
    repo,
    auth,
    providers: { stt: stt.name, translation: translator.name },
  });
  registerWebSockets(app, registry, auth, {
    // CORS no aplica a WebSocket: en producción solo se aceptan conexiones desde la web propia.
    allowedOrigins: config.production ? config.allowedOrigins : null,
  });

  app.addHook('onClose', async () => {
    registry.close();
    await Promise.allSettled([...pending]);
  });
  return { app, registry };
}
