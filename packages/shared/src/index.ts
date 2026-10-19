// Contrato compartido entre apps/api y apps/web (PRD §9.2 y §9.3).

export const LANGUAGES = {
  es: 'Castellano',
  ca: 'Català',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ro: 'Română',
  uk: 'Українська',
  ru: 'Русский',
  ar: 'العربية',
  zh: '中文',
} as const;

export type Language = keyof typeof LANGUAGES;

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as Language[];

/** Idiomas en los que puede hablar el profesor (entrada del STT). */
export const SOURCE_LANGUAGES = ['es', 'ca'] as const satisfies readonly Language[];

export type SourceLanguage = (typeof SOURCE_LANGUAGES)[number];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in LANGUAGES;
}

export type SessionStatus = 'ready' | 'live' | 'paused' | 'ended';

export const MAX_TARGET_LANGUAGES = 8;

// ---------- REST ----------
// Rutas de profesor/admin: `Authorization: Bearer <access token de Supabase Auth>`.

export type UserRole = 'teacher' | 'admin';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export type TeacherSummary = Me;

/** POST /api/teachers (admin). */
export interface CreateTeacherRequest {
  email: string;
  fullName: string;
  password: string;
}

export interface Course {
  id: string;
  name: string;
  sourceLanguage: SourceLanguage;
  targetLanguages: Language[];
  teacherIds: string[];
  createdAt: string;
}

/** POST /api/courses y PATCH /api/courses/:id (admin). */
export interface CourseInput {
  name: string;
  sourceLanguage: SourceLanguage;
  targetLanguages: Language[];
  teacherIds: string[];
}

export interface PublicSession {
  id: string;
  title: string;
  sourceLanguage: Language;
  targetLanguages: Language[];
  status: SessionStatus;
}

/** Sesión vista por su profesor (GET /api/sessions, POST /api/sessions). */
export interface TeacherSession extends PublicSession {
  courseId: string;
  teacherId: string;
}

/** POST /api/sessions: los idiomas salen de la configuración del curso. */
export interface CreateSessionRequest {
  courseId: string;
}

export type SessionAction = 'start' | 'pause' | 'resume' | 'end';

export interface ApiError {
  error: string;
  message: string;
}

// ---------- WebSocket alumno: /ws/student/:id?lang=xx&since=N ----------

export interface SubtitleEvent {
  type: 'subtitle.final';
  sessionId: string;
  sequence: number;
  language: Language;
  text: string;
  sourceStartedAtMs: number;
  sourceEndedAtMs: number;
  publishedAt: string;
}

export interface SubtitleBacklogEvent {
  type: 'subtitle.backlog';
  language: Language;
  items: SubtitleEvent[];
}

export interface SessionStatusEvent {
  type: 'session.status';
  status: SessionStatus;
}

export type StudentServerEvent =
  | SubtitleEvent
  | SubtitleBacklogEvent
  | SessionStatusEvent;

export interface LanguageSetMessage {
  type: 'language.set';
  language: Language;
}

export type StudentClientMessage = LanguageSetMessage;

// ---------- WebSocket profesor: /ws/teacher/:id ----------
// Tras abrir: mensaje `hello` con el access token de Supabase. Después `audio.start` y frames
// binarios PCM16 LE mono a `sampleRate`.

export type TeacherClientMessage =
  | { type: 'hello'; token: string }
  | { type: 'audio.start'; sampleRate: number }
  | { type: 'audio.stop' };

export type ServiceState = 'idle' | 'connecting' | 'ok' | 'error';

export interface HealthEvent {
  type: 'health';
  audio: 'idle' | 'ok';
  stt: ServiceState;
  translation: Partial<Record<Language, ServiceState>>;
  distribution: 'ok';
  latency: { count: number; lastMs: number | null; medianMs: number | null; p95Ms: number | null };
}

export interface AudienceEvent {
  type: 'audience';
  total: number;
  byLanguage: Partial<Record<Language, number>>;
  activeLanguages: Language[];
}

export interface TranscriptPartialEvent {
  type: 'transcript.partial';
  text: string;
}

export interface TranscriptFinalEvent {
  type: 'transcript.final';
  sequence: number;
  text: string;
}

export interface ReadyEvent {
  type: 'ready';
  session: TeacherSession;
}

export type TeacherServerEvent =
  | ReadyEvent
  | SessionStatusEvent
  | HealthEvent
  | AudienceEvent
  | TranscriptPartialEvent
  | TranscriptFinalEvent;

// Códigos de cierre WS de la aplicación.
export const WS_CLOSE = {
  unauthorized: 4401,
  notFound: 4404,
  badRequest: 4400,
  ended: 4410,
  full: 4429,
} as const;
