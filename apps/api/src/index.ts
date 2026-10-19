import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createAdminClient, SupabaseAuthVerifier, SupabaseRepository } from './db/supabase.js';
import { createProviders } from './providers/index.js';

const config = loadConfig();
const { stt, translator } = createProviders(config);
const db = createAdminClient(config.supabase.url, config.supabase.secretKey);
const repo = new SupabaseRepository(db);
const { app } = await buildApp({ config, stt, translator, repo, auth: new SupabaseAuthVerifier(db) });

if (stt.name === 'mock' || translator.name === 'mock')
  app.log.warn(`Proveedores mock activos (stt=${stt.name}, translation=${translator.name}). Configura .env para usar los reales.`);

// Las sesiones en directo viven en memoria: tras un reinicio, las abiertas en BD quedan huérfanas.
const orphans = await repo.closeOrphanSessions();
if (orphans) app.log.warn(`${orphans} sesiones abiertas de una ejecución anterior marcadas como finalizadas`);

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.port, host: config.host });
