import type { Language } from '@ct/shared';
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

export const options = { graceMs: 50, bufferSize: 10, translationTimeoutMs: 500, maxStudents: 5 };

export const flush = () => new Promise((r) => setTimeout(r, 10));
