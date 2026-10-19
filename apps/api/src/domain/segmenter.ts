import type { TranscriptResult } from '../providers/types.js';

export interface Segment {
  text: string;
  startMs: number;
  endMs: number;
}

const MAX_SEGMENT_CHARS = 400;

/**
 * Agrupa resultados finales del STT en segmentos traducibles (FR-06).
 * Cierra el segmento en fin de enunciado, al superar MAX_SEGMENT_CHARS
 * o tras `maxWaitMs` sin nuevo final.
 */
export class Segmenter {
  private parts: string[] = [];
  private startMs = 0;
  private endMs = 0;
  private seen = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private onSegment: (segment: Segment) => void,
    private onPartial: (text: string) => void,
    private maxWaitMs = 1800,
  ) {}

  /** `offsetMs` desplaza los tiempos del stream actual al reloj de la sesión. */
  accept(r: TranscriptResult, offsetMs = 0) {
    const text = r.text.trim();
    if (!r.isFinal) {
      if (text) this.onPartial([...this.parts, text].join(' '));
      return;
    }
    const key = `${offsetMs}:${r.start}:${r.duration}`;
    if (text && !this.seen.has(key)) {
      this.seen.add(key);
      if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
      if (!this.parts.length) this.startMs = offsetMs + Math.round(r.start * 1000);
      this.endMs = offsetMs + Math.round((r.start + r.duration) * 1000);
      this.parts.push(text);
    }
    if (r.speechFinal || this.parts.join(' ').length >= MAX_SEGMENT_CHARS) {
      this.flush();
    } else if (this.parts.length && !this.timer) {
      this.timer = setTimeout(() => this.flush(), this.maxWaitMs);
    }
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const text = this.parts.join(' ');
    this.parts = [];
    if (text) this.onSegment({ text, startMs: this.startMs, endMs: this.endMs });
  }

  close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.parts = [];
    this.seen.clear();
  }
}
