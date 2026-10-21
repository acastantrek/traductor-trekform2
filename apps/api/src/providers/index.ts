import type { Config } from '../config.js';
import { DeepgramProvider } from './deepgram.js';
import { DeeplTranslationProvider } from './deepl.js';
import { GoogleTranslationProvider } from './google.js';
import { MockSttProvider, MockTranslationProvider } from './mock.js';
import type { SpeechToTextProvider, TranslationProvider } from './types.js';

export function createProviders(config: Config): {
  stt: SpeechToTextProvider;
  translator: TranslationProvider;
} {
  const stt =
    config.stt.provider === 'deepgram'
      ? new DeepgramProvider(config.stt.apiKey!, config.stt.model)
      : new MockSttProvider();
  const translator =
    config.translation.provider === 'deepl'
      ? new DeeplTranslationProvider(config.translation.apiKey!)
      : config.translation.provider === 'google'
        ? new GoogleTranslationProvider(config.translation.apiKey!)
        : new MockTranslationProvider();
  return { stt, translator };
}
