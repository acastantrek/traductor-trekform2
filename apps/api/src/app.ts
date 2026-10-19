import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import type { Config } from './config.js';
import { SessionRegistry } from './domain/registry.js';
import { registerRoutes } from './http/routes.js';
import type { SpeechToTextProvider, TranslationProvider } from './providers/types.js';
import { registerWebSockets } from './ws/handlers.js';

export interface AppDeps {
  config: Config;
  stt: SpeechToTextProvider;
  translator: TranslationProvider;
  logger?: boolean;
}

export async function buildApp({ config, stt, translator, logger = true }: AppDeps) {
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
  });
  const registry = new SessionRegistry({ stt, translator }, config.session);

  await app.register(cors, { origin: config.allowedOrigins });
  await app.register(websocket, { options: { maxPayload: 256 * 1024 } });

  registerRoutes(app, registry, { stt: stt.name, translation: translator.name });
  registerWebSockets(app, registry);

  app.addHook('onClose', async () => registry.close());
  return { app, registry };
}
