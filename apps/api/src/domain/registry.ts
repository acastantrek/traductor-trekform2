import { randomBytes } from 'node:crypto';
import type { CreateSessionRequest } from '@ct/shared';
import { hashToken, Session, type SessionDeps, type SessionOptions } from './session.js';

export interface RegistryLimits {
  maxSessions: number;
  /** Tiempo que una sesión finalizada sigue respondiendo "ended" antes de borrarse. */
  endedTtlMs: number;
  /** Sesiones sin clientes ni actividad durante este tiempo se descartan. */
  idleTtlMs: number;
}

const DEFAULT_LIMITS: RegistryLimits = {
  maxSessions: 100,
  endedTtlMs: 10 * 60_000,
  idleTtlMs: 6 * 60 * 60_000,
};

/**
 * Sesiones en memoria. Suficiente para F0–F2 con un único proceso;
 * en F3 la configuración persistente pasa a Supabase.
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

  create(input: CreateSessionRequest): { session: Session; teacherToken: string } | null {
    this.sweep();
    if (this.sessions.size >= this.limits.maxSessions) return null;
    const id = randomBytes(9).toString('base64url');
    const teacherToken = randomBytes(24).toString('base64url');
    const session = new Session(
      id,
      input.title,
      input.sourceLanguage,
      input.targetLanguages,
      hashToken(teacherToken),
      this.deps,
      this.options,
    );
    this.sessions.set(id, session);
    return { session, teacherToken };
  }

  get(id: string) {
    return this.sessions.get(id);
  }

  get size() {
    return this.sessions.size;
  }

  sweep(now = Date.now()) {
    for (const [id, s] of this.sessions) {
      const expiredEnded = s.endedAt !== undefined && now - s.endedAt > this.limits.endedTtlMs;
      const idle = s.connectedCount === 0 && now - s.lastActivityAt > this.limits.idleTtlMs;
      if (expiredEnded || idle) {
        s.dispose();
        this.sessions.delete(id);
      }
    }
  }

  close() {
    clearInterval(this.sweeper);
    for (const s of this.sessions.values()) s.dispose();
    this.sessions.clear();
  }
}
