import { createHash, timingSafeEqual } from 'node:crypto';
import {
  WS_CLOSE,
  type AudienceEvent,
  type HealthEvent,
  type Language,
  type PublicSession,
  type ServiceState,
  type SessionAction,
  type SessionStatus,
  type StudentServerEvent,
  type SubtitleBacklogEvent,
  type SubtitleEvent,
  type TeacherServerEvent,
} from '@ct/shared';
import type { SpeechToTextProvider, SttStream, TranslationProvider } from '../providers/types.js';
import { LatencyTracker } from './latency.js';
import { Segmenter, type Segment } from './segmenter.js';

export interface TeacherClient {
  send(event: TeacherServerEvent): void;
}

export interface StudentClient {
  send(event: StudentServerEvent): void;
  close(code: number, reason: string): void;
}

export interface SessionDeps {
  stt: SpeechToTextProvider;
  translator: TranslationProvider;
}

export interface SessionOptions {
  graceMs: number;
  bufferSize: number;
  translationTimeoutMs: number;
  maxStudents: number;
}

interface BufferedSegment {
  sequence: number;
  sourceText: string;
  startMs: number;
  endMs: number;
  /** Evento publicado por idioma, incluido el de origen. */
  events: Map<Language, SubtitleEvent>;
}

const TRANSITIONS: Record<SessionAction, { from: SessionStatus[]; to: SessionStatus }> = {
  start: { from: ['ready'], to: 'live' },
  pause: { from: ['live'], to: 'paused' },
  resume: { from: ['paused'], to: 'live' },
  end: { from: ['ready', 'live', 'paused'], to: 'ended' },
};

const BACKFILL_SEGMENTS = 3;
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;
const AUDIO_STALE_MS = 2000;

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest();
}

/**
 * Una clase en directo: estado, audiencia por idioma, pipeline
 * audio → STT → segmentos → traducción por idioma activo → fan-out.
 */
export class Session {
  status: SessionStatus = 'ready';
  readonly createdAt = Date.now();
  lastActivityAt = Date.now();
  endedAt: number | undefined;
  readonly latency = new LatencyTracker();
  readonly stats = { segments: 0, translations: 0, charsTranslated: 0, providerErrors: 0, sttReconnects: 0 };

  private teachers = new Set<TeacherClient>();
  private students = new Map<StudentClient, Language>();
  private graceTimers = new Map<Language, ReturnType<typeof setTimeout>>();
  private buffer: BufferedSegment[] = [];
  private sequence = 0;
  private inflight = new Set<string>();

  private stream: SttStream | undefined;
  private sampleRate: number | undefined;
  private streamAudioMs = 0;
  private offsetMs = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  private lastAudioAt = 0;

  private sttState: ServiceState = 'idle';
  private translationState = new Map<Language, ServiceState>();
  private breakers = new Map<Language, { failures: number; openUntil: number }>();
  private healthTimer: ReturnType<typeof setInterval>;
  private segmenter: Segmenter;

  constructor(
    readonly id: string,
    readonly title: string,
    readonly sourceLanguage: Language,
    readonly targetLanguages: Language[],
    private tokenHash: Buffer,
    private deps: SessionDeps,
    private options: SessionOptions,
  ) {
    this.segmenter = new Segmenter(
      (segment) => this.onSegment(segment),
      (text) => this.toTeachers({ type: 'transcript.partial', text }),
    );
    this.healthTimer = setInterval(() => {
      if (this.teachers.size) this.toTeachers(this.health());
    }, 2000);
    this.healthTimer.unref();
  }

  verifyTeacher(token: string) {
    return timingSafeEqual(hashToken(token), this.tokenHash);
  }

  get allowedLanguages(): Language[] {
    return [this.sourceLanguage, ...this.targetLanguages];
  }

  get connectedCount() {
    return this.teachers.size + this.students.size;
  }

  public(): PublicSession {
    return {
      id: this.id,
      title: this.title,
      sourceLanguage: this.sourceLanguage,
      targetLanguages: this.targetLanguages,
      status: this.status,
    };
  }

  // ---------- Control de sesión (FR-13, FR-14) ----------

  transition(action: SessionAction): boolean {
    const rule = TRANSITIONS[action];
    if (!rule.from.includes(this.status)) return false;
    this.status = rule.to;
    this.lastActivityAt = Date.now();
    if (rule.to === 'live') this.openStream();
    if (rule.to === 'paused') {
      this.closeStream();
      this.segmenter.flush();
    }
    const event = { type: 'session.status', status: this.status } as const;
    this.toTeachers(event);
    for (const client of this.students.keys()) client.send(event);
    if (rule.to === 'ended') {
      this.endedAt = Date.now();
      this.dispose();
      for (const client of this.students.keys()) client.close(WS_CLOSE.ended, 'session ended');
      this.students.clear();
    }
    return true;
  }

  // ---------- Profesor ----------

  addTeacher(client: TeacherClient) {
    this.teachers.add(client);
    this.lastActivityAt = Date.now();
    client.send({ type: 'ready', session: this.public() });
    client.send({ type: 'session.status', status: this.status });
    client.send(this.audience());
    client.send(this.health());
    for (const s of this.buffer.slice(-20))
      client.send({ type: 'transcript.final', sequence: s.sequence, text: s.sourceText });
  }

  removeTeacher(client: TeacherClient) {
    this.teachers.delete(client);
    // Sin profesor no llega audio: no mantener abierto el stream del proveedor.
    if (!this.teachers.size) this.audioStop();
  }

  audioStart(sampleRate: number) {
    if (this.stream && this.sampleRate !== sampleRate) this.closeStream();
    this.sampleRate = sampleRate;
    this.openStream();
  }

  audioStop() {
    this.closeStream();
    this.segmenter.flush();
    this.sampleRate = undefined;
  }

  audio(pcm16: Buffer) {
    this.lastAudioAt = Date.now();
    this.lastActivityAt = this.lastAudioAt;
    if (this.status !== 'live' || !this.stream || !this.sampleRate) return;
    this.stream.send(pcm16);
    this.streamAudioMs += (pcm16.length / 2 / this.sampleRate) * 1000;
  }

  // ---------- Alumnos (FR-10, FR-12, FR-15, FR-16) ----------

  addStudent(client: StudentClient, language: Language, since = 0): 'ok' | 'ended' | 'full' {
    if (this.status === 'ended') return 'ended';
    if (this.students.size >= this.options.maxStudents) return 'full';
    const wasActive = this.isActive(language);
    this.students.set(client, language);
    this.lastActivityAt = Date.now();
    this.onLanguageJoined(language, wasActive);
    client.send({ type: 'session.status', status: this.status });
    client.send(this.backlog(language, since));
    this.toTeachers(this.audience());
    return 'ok';
  }

  setStudentLanguage(client: StudentClient, language: Language) {
    const previous = this.students.get(client);
    if (!previous) return;
    if (previous !== language) {
      const wasActive = this.isActive(language);
      this.students.set(client, language);
      this.onLanguageLeft(previous);
      this.onLanguageJoined(language, wasActive);
      this.toTeachers(this.audience());
    }
    client.send(this.backlog(language, 0));
  }

  removeStudent(client: StudentClient) {
    const language = this.students.get(client);
    if (!language) return;
    this.students.delete(client);
    this.onLanguageLeft(language);
    this.toTeachers(this.audience());
  }

  activeLanguages(): Language[] {
    return this.targetLanguages.filter((l) => this.isActive(l));
  }

  audience(): AudienceEvent {
    const byLanguage: Partial<Record<Language, number>> = {};
    for (const l of this.students.values()) byLanguage[l] = (byLanguage[l] ?? 0) + 1;
    return {
      type: 'audience',
      total: this.students.size,
      byLanguage,
      activeLanguages: this.activeLanguages(),
    };
  }

  health(): HealthEvent {
    const translation: HealthEvent['translation'] = {};
    for (const l of this.activeLanguages()) translation[l] = this.translationState.get(l) ?? 'idle';
    return {
      type: 'health',
      audio: Date.now() - this.lastAudioAt < AUDIO_STALE_MS ? 'ok' : 'idle',
      stt: this.sttState,
      translation,
      distribution: 'ok',
      latency: this.latency.snapshot(),
    };
  }

  dispose() {
    clearInterval(this.healthTimer);
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
    this.closeStream();
    this.segmenter.close();
  }

  // ---------- Internos ----------

  private isActive(language: Language) {
    if (language === this.sourceLanguage) return false;
    return this.graceTimers.has(language) || [...this.students.values()].includes(language);
  }

  private onLanguageJoined(language: Language, wasActive: boolean) {
    const timer = this.graceTimers.get(language);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(language);
    }
    if (!wasActive && language !== this.sourceLanguage) this.backfill(language);
  }

  /** Mantiene el idioma activo `graceMs` tras quedarse sin alumnos (caso de uso 5). */
  private onLanguageLeft(language: Language) {
    if (language === this.sourceLanguage) return;
    if ([...this.students.values()].includes(language)) return;
    const timer = setTimeout(() => {
      this.graceTimers.delete(language);
      this.translationState.delete(language);
      this.toTeachers(this.audience());
    }, this.options.graceMs);
    timer.unref();
    this.graceTimers.set(language, timer);
  }

  /** Al activar un idioma, traduce los últimos segmentos para que el alumno no empiece en blanco. */
  private backfill(language: Language) {
    const closedAt = Date.now();
    for (const entry of this.buffer.slice(-BACKFILL_SEGMENTS))
      if (!entry.events.has(language)) void this.translateAndPublish(entry, language, closedAt, false);
  }

  private backlog(language: Language, since: number): SubtitleBacklogEvent {
    const items: SubtitleEvent[] = [];
    for (const entry of this.buffer) {
      const event = entry.events.get(language);
      if (event && entry.sequence > since) items.push(event);
    }
    return { type: 'subtitle.backlog', language, items };
  }

  private onSegment(segment: Segment) {
    if (this.status === 'ended') return;
    const closedAt = Date.now();
    const entry: BufferedSegment = {
      sequence: ++this.sequence,
      sourceText: segment.text,
      startMs: segment.startMs,
      endMs: segment.endMs,
      events: new Map(),
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.options.bufferSize) this.buffer.shift();
    this.stats.segments++;
    this.toTeachers({ type: 'transcript.final', sequence: entry.sequence, text: entry.sourceText });
    this.publish(entry, this.sourceLanguage, entry.sourceText);
    for (const language of this.activeLanguages())
      void this.translateAndPublish(entry, language, closedAt, true);
  }

  /** Una traducción por segmento e idioma, compartida por todos sus alumnos (FR-07, AC-05). */
  private async translateAndPublish(
    entry: BufferedSegment,
    language: Language,
    closedAt: number,
    measure: boolean,
  ) {
    const key = `${entry.sequence}:${language}`;
    if (this.inflight.has(key) || entry.events.has(language)) return;
    const breaker = this.breakers.get(language);
    if (breaker && breaker.openUntil > Date.now()) return;
    this.inflight.add(key);
    try {
      const text = await this.deps.translator.translate(
        entry.sourceText,
        this.sourceLanguage,
        language,
        AbortSignal.timeout(this.options.translationTimeoutMs),
      );
      if (this.status === 'ended') return;
      this.stats.translations++;
      this.stats.charsTranslated += entry.sourceText.length;
      this.breakers.delete(language);
      this.setTranslationState(language, 'ok');
      this.publish(entry, language, text);
      if (measure) this.latency.record(Date.now() - closedAt);
    } catch {
      // NFR-12: el fallo de un idioma no afecta al resto ni al texto original.
      this.stats.providerErrors++;
      const b = this.breakers.get(language) ?? { failures: 0, openUntil: 0 };
      b.failures++;
      if (b.failures >= BREAKER_THRESHOLD) {
        b.failures = 0;
        b.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      }
      this.breakers.set(language, b);
      this.setTranslationState(language, 'error');
    } finally {
      this.inflight.delete(key);
    }
  }

  private publish(entry: BufferedSegment, language: Language, text: string) {
    const event: SubtitleEvent = {
      type: 'subtitle.final',
      sessionId: this.id,
      sequence: entry.sequence,
      language,
      text,
      sourceStartedAtMs: entry.startMs,
      sourceEndedAtMs: entry.endMs,
      publishedAt: new Date().toISOString(),
    };
    entry.events.set(language, event);
    for (const [client, l] of this.students) if (l === language) client.send(event);
  }

  private openStream() {
    if (this.stream || !this.sampleRate || this.status !== 'live') return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.offsetMs += this.streamAudioMs;
    this.streamAudioMs = 0;
    const offset = this.offsetMs;
    this.setSttState('connecting');
    const stream: SttStream = this.deps.stt.open(
      { language: this.sourceLanguage, sampleRate: this.sampleRate },
      {
        onOpen: () => {
          if (this.stream !== stream) return;
          this.retries = 0;
          this.setSttState('ok');
        },
        onResult: (r) => {
          if (this.stream === stream) this.segmenter.accept(r, offset);
        },
        onError: () => {
          if (this.stream !== stream) return;
          this.stream = undefined;
          this.segmenter.flush();
          this.setSttState('error');
          this.scheduleRetry();
        },
      },
    );
    this.stream = stream;
  }

  private scheduleRetry() {
    if (this.status !== 'live' || !this.sampleRate) return;
    const delay = Math.min(1000 * 2 ** this.retries, 10_000);
    this.retries++;
    this.stats.sttReconnects++;
    this.retryTimer = setTimeout(() => this.openStream(), delay);
    this.retryTimer.unref();
  }

  private closeStream() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.retries = 0;
    const stream = this.stream;
    this.stream = undefined;
    stream?.close();
    this.setSttState('idle');
  }

  private setSttState(state: ServiceState) {
    if (this.sttState === state) return;
    this.sttState = state;
    this.toTeachers(this.health());
  }

  private setTranslationState(language: Language, state: ServiceState) {
    if (this.translationState.get(language) === state) return;
    this.translationState.set(language, state);
    this.toTeachers(this.health());
  }

  private toTeachers(event: TeacherServerEvent) {
    for (const t of this.teachers) t.send(event);
  }
}
