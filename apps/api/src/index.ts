import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createProviders } from './providers/index.js';

const config = loadConfig();
const { stt, translator } = createProviders(config);
const { app } = await buildApp({ config, stt, translator });

if (stt.name === 'mock' || translator.name === 'mock')
  app.log.warn(`Proveedores mock activos (stt=${stt.name}, translation=${translator.name}). Configura apps/api/.env para usar los reales.`);

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
