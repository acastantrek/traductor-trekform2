import type {
  Course,
  CourseInput,
  CreateTeacherRequest,
  Me,
  SessionStatus,
  TeacherSummary,
} from '@ct/shared';

export type AuthUser = Me;

/** Verifica el access token de Supabase Auth y devuelve el perfil con su rol. */
export interface AuthVerifier {
  verify(accessToken: string): Promise<AuthUser | null>;
}

export interface SessionRow {
  id: string;
  courseId: string;
  teacherId: string;
  sourceLanguage: string;
  targetLanguages: string[];
}

/** Métricas agregadas al cerrar una sesión (AC-11). Sin texto ni audio. */
export interface SessionMetrics {
  durationSeconds: number;
  audioSeconds: number;
  segments: number;
  translations: number;
  charsTranslated: number;
  latencyMedianMs: number | null;
  latencyP95Ms: number | null;
  providerErrors: number;
  sttReconnects: number;
  peakStudents: number;
  languagesUsed: string[];
}

export interface Repository {
  listTeachers(): Promise<TeacherSummary[]>;
  createTeacher(input: CreateTeacherRequest): Promise<TeacherSummary>;

  /** Admin: todos. Profesor: solo los cursos de los que es miembro. */
  listCourses(user: AuthUser): Promise<Course[]>;
  getCourse(id: string): Promise<Course | null>;
  createCourse(input: CourseInput, createdBy: string): Promise<Course>;
  updateCourse(id: string, input: CourseInput): Promise<Course | null>;

  createSession(row: SessionRow): Promise<void>;
  updateSessionStatus(id: string, status: SessionStatus): Promise<void>;
  saveSessionMetrics(id: string, metrics: SessionMetrics): Promise<void>;
  /** Al arrancar: las sesiones en memoria se perdieron, se cierran en BD. */
  closeOrphanSessions(): Promise<number>;
}

export class ConflictError extends Error {}
