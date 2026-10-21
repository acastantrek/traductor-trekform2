import { randomBytes } from 'node:crypto';
import type { UserRole } from '@ct/shared';
import { Session, type SessionDeps, type SessionInit, type SessionOptions } from './session.js';

export interface RegistryLimits {
  maxSessions: number;
  /** Tiempo que una sesión finalizada sigue respondiendo "ended" antes de borrarse. */
  endedTtlMs: number;
  /** Sesiones sin clientes ni actividad durante este tiempo se finalizan. */
  idleTtlMs: number;
}

const DEFAULT_LIMITS: RegistryLimits = {
  maxSessions: 100,
  endedTtlMs: 10 * 60_000,
  idleTtlMs: 6 * 60 * 60_000,
};

/**
 * Sesiones en directo, en memoria (un único proceso). La configuración y el
 * historial persistentes viven en Supabase; aquí solo el estado realtime.
 */
export class SessionRegistry {
  private sessions = new Map<string, Session>();
  private sweeper: ReturnType<typeof setInterval>;

  constructor(
    private deps: SessionDeps,
    private options: SessionOptions,
    private limits: RegistryLimits = DEFAULT_LIMITS,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  get full() {
    this.sweep();
    return this.sessions.size >= this.limits.maxSessions;
  }

  create(init: Omit<SessionInit, 'id'>): Session {
    const id = randomBytes(9).toString('base64url');
    const session = new Session({ ...init, id }, this.deps, this.options);
    this.sessions.set(id, session);
    return session;
  }

  /** Para deshacer una creación cuyo guardado en BD falló. */
  discard(id: string) {
    this.sessions.get(id)?.dispose();
    this.sessions.delete(id);
  }

  get(id: string) {
    return this.sessions.get(id);
  }

  get size() {
    return this.sessions.size;
  }

  /** Si el curso o el profesor tienen alguna sesión sin finalizar. */
  hasOpenSession(by: { courseId: string } | { teacherId: string }) {
    return [...this.sessions.values()].some(
      (s) => s.status !== 'ended' && ('courseId' in by ? s.courseId === by.courseId : s.teacherId === by.teacherId),
    );
  }

  /** Sesiones abiertas que el usuario puede operar. */
  openFor(user: { id: string; role: UserRole }) {
    return [...this.sessions.values()].filter((s) => s.status !== 'ended' && s.canControl(user));
  }

  sweep(now = Date.now()) {
    for (const [id, s] of this.sessions) {
      if (s.endedAt === undefined && s.connectedCount === 0 && now - s.lastActivityAt > this.limits.idleTtlMs)
        s.transition('end');
      if (s.endedAt !== undefined && now - s.endedAt > this.limits.endedTtlMs) {
        s.dispose();
        this.sessions.delete(id);
      }
    }
  }

  /** Cierre ordenado del servidor: finaliza las sesiones abiertas para persistir sus métricas. */
  close() {
    clearInterval(this.sweeper);
    for (const s of this.sessions.values()) {
      if (s.status !== 'ended') s.transition('end');
      s.dispose();
    }
    this.sessions.clear();
  }
}
