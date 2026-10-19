import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  STT_PROVIDER: z.enum(['deepgram', 'mock', '']).optional(),
  TRANSLATION_PROVIDER: z.enum(['google', 'mock', '']).optional(),
  DEEPGRAM_API_KEY: optional,
  DEEPGRAM_MODEL: z.string().default('nova-3'),
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
    e.TRANSLATION_PROVIDER || (e.GOOGLE_TRANSLATE_API_KEY ? 'google' : 'mock');
  if (stt === 'deepgram' && !e.DEEPGRAM_API_KEY)
    throw new Error('STT_PROVIDER=deepgram requiere DEEPGRAM_API_KEY');
  if (translation === 'google' && !e.GOOGLE_TRANSLATE_API_KEY)
    throw new Error('TRANSLATION_PROVIDER=google requiere GOOGLE_TRANSLATE_API_KEY');
  return {
    port: e.PORT,
    host: e.HOST,
    allowedOrigins: e.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    stt: { provider: stt, apiKey: e.DEEPGRAM_API_KEY, model: e.DEEPGRAM_MODEL },
    translation: { provider: translation, apiKey: e.GOOGLE_TRANSLATE_API_KEY },
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
