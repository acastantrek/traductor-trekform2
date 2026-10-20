import { randomUUID } from 'node:crypto';
import type { Course, CourseInput, CreateTeacherRequest, Language, SessionStatus } from '@ct/shared';
import {
  ConflictError,
  type AuthUser,
  type AuthVerifier,
  type Repository,
  type SessionMetrics,
  type SessionRow,
} from '../src/db/types.js';
import type {
  SpeechToTextProvider,
  SttStreamHandlers,
  TranscriptResult,
  TranslationProvider,
} from '../src/providers/types.js';

/** STT controlable desde el test: `emit` simula resultados del proveedor. */
export class FakeStt implements SpeechToTextProvider {
  readonly name = 'fake';
  opened = 0;
  closed = 0;
  bytes = 0;
  handlers: SttStreamHandlers | undefined;

  open(_options: { language: Language; sampleRate: number }, handlers: SttStreamHandlers) {
    this.opened++;
    this.handlers = handlers;
    queueMicrotask(() => handlers.onOpen());
    return {
      send: (pcm: Buffer) => {
        this.bytes += pcm.length;
      },
      close: () => {
        this.closed++;
      },
    };
  }

  emit(r: Partial<TranscriptResult> & { text: string }) {
    this.handlers?.onResult({ isFinal: true, speechFinal: true, start: 0, duration: 1, ...r });
  }
}

export class FakeTranslator implements TranslationProvider {
  readonly name = 'fake';
  calls: { text: string; target: Language }[] = [];
  failFor = new Set<Language>();

  async translate(text: string, _source: Language, target: Language) {
    this.calls.push({ text, target });
    if (this.failFor.has(target)) throw new Error('boom');
    return `${target}:${text}`;
  }
}

/** Tokens de prueba: el token es el id del usuario. */
export class FakeAuth implements AuthVerifier {
  constructor(private users: Map<string, AuthUser>) {}
  async verify(token: string) {
    return this.users.get(token) ?? null;
  }
}

/** Repositorio en memoria con la misma semántica que el de Supabase. */
export class MemoryRepository implements Repository {
  users = new Map<string, AuthUser>();
  courses = new Map<string, Course>();
  sessions = new Map<string, SessionRow & { status: SessionStatus }>();
  metrics = new Map<string, SessionMetrics>();

  addUser(role: AuthUser['role'], name: string = role): AuthUser {
    const user: AuthUser = { id: randomUUID(), email: `${name}@test.local`, fullName: name, role };
    this.users.set(user.id, user);
    return user;
  }

  async listTeachers() {
    return [...this.users.values()];
  }

  async createTeacher(input: CreateTeacherRequest) {
    if ([...this.users.values()].some((u) => u.email === input.email)) throw new ConflictError('duplicado');
    const user: AuthUser = { id: randomUUID(), email: input.email, fullName: input.fullName, role: 'teacher' };
    this.users.set(user.id, user);
    return user;
  }

  passwords = new Map<string, string>();

  async setPassword(userId: string, password: string) {
    if (!this.users.has(userId)) return false;
    this.passwords.set(userId, password);
    return true;
  }

  async listCourses(user: AuthUser) {
    return [...this.courses.values()].filter((c) => user.role === 'admin' || c.teacherIds.includes(user.id));
  }

  async getCourse(id: string) {
    return this.courses.get(id) ?? null;
  }

  async createCourse(input: CourseInput) {
    const course: Course = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.courses.set(course.id, course);
    return course;
  }

  async updateCourse(id: string, input: CourseInput) {
    const current = this.courses.get(id);
    if (!current) return null;
    const course = { ...current, ...input };
    this.courses.set(id, course);
    return course;
  }

  async createSession(row: SessionRow) {
    this.sessions.set(row.id, { ...row, status: 'ready' });
  }

  async updateSessionStatus(id: string, status: SessionStatus) {
    const s = this.sessions.get(id);
    if (s) s.status = status;
  }

  async saveSessionMetrics(id: string, metrics: SessionMetrics) {
    this.metrics.set(id, metrics);
  }

  async closeOrphanSessions() {
    let n = 0;
    for (const s of this.sessions.values())
      if (s.status !== 'ended') {
        s.status = 'ended';
        n++;
      }
    return n;
  }
}

export const options = { graceMs: 50, bufferSize: 10, translationTimeoutMs: 500, maxStudents: 5 };

export const flush = () => new Promise((r) => setTimeout(r, 10));
