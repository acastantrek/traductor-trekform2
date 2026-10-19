import type { Language } from '@ct/shared';
import type {
  SpeechToTextProvider,
  SttStream,
  SttStreamHandlers,
  TranslationProvider,
} from './types.js';

// Proveedores falsos para desarrollar sin claves. Nunca se usan si hay clave configurada.

const PHRASES = [
  'Bienvenidos a la sesión de hoy.',
  'Antes de usar la máquina, comprobad los sistemas de seguridad.',
  'Llevad siempre las gafas de protección en el taller.',
  'Ahora vamos a revisar el procedimiento paso a paso.',
  '¿Alguien tiene alguna pregunta hasta aquí?',
];

/** Emite una frase cada ~3 s de audio recibido, con parciales palabra a palabra. */
export class MockSttProvider implements SpeechToTextProvider {
  readonly name = 'mock';

  open(options: { sampleRate: number }, handlers: SttStreamHandlers): SttStream {
    let audioSeconds = 0;
    let phrase = 0;
    let phraseStart = 0;
    let closed = false;
    queueMicrotask(() => !closed && handlers.onOpen());
    return {
      send(pcm16) {
        if (closed) return;
        audioSeconds += pcm16.length / 2 / options.sampleRate;
        const words = PHRASES[phrase % PHRASES.length]!.split(' ');
        const elapsed = audioSeconds - phraseStart;
        const shown = Math.min(words.length, Math.floor(elapsed / 0.4));
        if (shown > 0 && shown < words.length) {
          handlers.onResult({
            text: words.slice(0, shown).join(' '),
            isFinal: false,
            speechFinal: false,
            start: phraseStart,
            duration: elapsed,
          });
        } else if (shown >= words.length && elapsed >= 3) {
          handlers.onResult({
            text: words.join(' '),
            isFinal: true,
            speechFinal: true,
            start: phraseStart,
            duration: elapsed,
          });
          phrase++;
          phraseStart = audioSeconds;
        }
      },
      close() {
        closed = true;
      },
    };
  }
}

export class MockTranslationProvider implements TranslationProvider {
  readonly name = 'mock';
  calls = 0;
  constructor(private delayMs = 150) {}

  async translate(text: string, _source: Language, target: Language, signal: AbortSignal) {
    this.calls++;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, this.delayMs);
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        reject(signal.reason);
      });
    });
    return `[${target}] ${text}`;
  }
}
