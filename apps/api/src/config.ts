import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  ALLOWED_ORIGINS: z.string().optional(),
  // Saltos de proxy de confianza (Railway/Fly/Render: 1). Sin esto, el rate limit ve la IP del proxy.
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),
  // Peticiones REST por minuto e IP. Un aula comparte IP pública: dimensionar para todos sus alumnos.
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(600),
  // Solo para demos: permite arrancar en producción sin proveedores reales.
  ALLOW_MOCK_PROVIDERS: z.enum(['true', 'false']).default('false'),
  STT_PROVIDER: z.enum(['deepgram', 'mock', '']).optional(),
  TRANSLATION_PROVIDER: z.enum(['deepl', 'google', 'mock', '']).optional(),
  DEEPGRAM_API_KEY: optional,
  DEEPGRAM_MODEL: z.string().default('nova-3'),
  DEEPL_API_KEY: optional,
  GOOGLE_TRANSLATE_API_KEY: optional,
  SUPABASE_URL: z.string().url({ message: 'SUPABASE_URL es obligatoria (npx supabase status)' }),
  SUPABASE_SECRET_KEY: z.string().min(1, 'SUPABASE_SECRET_KEY es obligatoria (npx supabase status)'),
  LANGUAGE_GRACE_MS: z.coerce.number().int().nonnegative().default(15000),
  MAX_STUDENTS_PER_SESSION: z.coerce.number().int().positive().default(150),
  BUFFER_SIZE: z.coerce.number().int().positive().default(50),
  TRANSLATION_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
  // false solo para procesos que comparten BD con otra API en marcha (p. ej. E2E).
  CLOSE_ORPHANS_ON_START: z.enum(['true', 'false']).default('true'),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = schema.parse(env);
  const stt = e.STT_PROVIDER || (e.DEEPGRAM_API_KEY ? 'deepgram' : 'mock');
  const translation =
    e.TRANSLATION_PROVIDER || (e.DEEPL_API_KEY ? 'deepl' : e.GOOGLE_TRANSLATE_API_KEY ? 'google' : 'mock');
  const production = e.NODE_ENV === 'production';
  if (production && !e.ALLOWED_ORIGINS)
    throw new Error('En producción ALLOWED_ORIGINS es obligatoria (URL pública de la web)');
  if (production && e.ALLOW_MOCK_PROVIDERS !== 'true' && (stt === 'mock' || translation === 'mock'))
    throw new Error(
      `En producción no se permiten proveedores mock (stt=${stt}, translation=${translation}). ` +
        'Configura las claves o ALLOW_MOCK_PROVIDERS=true para una demo.',
    );
  if (stt === 'deepgram' && !e.DEEPGRAM_API_KEY)
    throw new Error('STT_PROVIDER=deepgram requiere DEEPGRAM_API_KEY');
  if (translation === 'deepl' && !e.DEEPL_API_KEY)
    throw new Error('TRANSLATION_PROVIDER=deepl requiere DEEPL_API_KEY');
  if (translation === 'google' && !e.GOOGLE_TRANSLATE_API_KEY)
    throw new Error('TRANSLATION_PROVIDER=google requiere GOOGLE_TRANSLATE_API_KEY');
  return {
    production,
    port: e.PORT,
    host: e.HOST,
    allowedOrigins: (e.ALLOWED_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    trustProxy: e.TRUST_PROXY,
    rateLimitPerMinute: e.RATE_LIMIT_PER_MINUTE,
    stt: { provider: stt, apiKey: e.DEEPGRAM_API_KEY, model: e.DEEPGRAM_MODEL },
    translation: {
      provider: translation,
      apiKey: translation === 'deepl' ? e.DEEPL_API_KEY : e.GOOGLE_TRANSLATE_API_KEY,
    },
    supabase: { url: e.SUPABASE_URL, secretKey: e.SUPABASE_SECRET_KEY },
    closeOrphansOnStart: e.CLOSE_ORPHANS_ON_START === 'true',
    session: {
      graceMs: e.LANGUAGE_GRACE_MS,
      maxStudents: e.MAX_STUDENTS_PER_SESSION,
      bufferSize: e.BUFFER_SIZE,
      translationTimeoutMs: e.TRANSLATION_TIMEOUT_MS,
    },
  };
}
