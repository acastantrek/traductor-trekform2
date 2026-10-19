import type { Language } from '@ct/shared';

/** Resultado de STT normalizado. Tiempos en segundos desde el inicio del stream. */
export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  /** El proveedor detecta fin de enunciado (endpointing). */
  speechFinal: boolean;
  start: number;
  duration: number;
}

export interface SttStreamHandlers {
  onResult(result: TranscriptResult): void;
  onOpen(): void;
  /** Fallo o cierre inesperado. El stream queda inutilizable. */
  onError(error: Error): void;
}

export interface SttStream {
  send(pcm16: Buffer): void;
  close(): void;
}

export interface SpeechToTextProvider {
  readonly name: string;
  open(options: { language: Language; sampleRate: number }, handlers: SttStreamHandlers): SttStream;
}

export interface TranslationProvider {
  readonly name: string;
  translate(
    text: string,
    source: Language,
    target: Language,
    signal: AbortSignal,
  ): Promise<string>;
}
