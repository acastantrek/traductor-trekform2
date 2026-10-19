import type { Language } from '@ct/shared';
import type { TranslationProvider } from './types.js';

// Google Cloud Translation v2 (Basic) con API key restringida a esta API.
const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

interface V2Response {
  data?: { translations?: { translatedText?: string }[] };
}

export class GoogleTranslationProvider implements TranslationProvider {
  readonly name = 'google';
  constructor(private apiKey: string) {}

  async translate(text: string, source: Language, target: Language, signal: AbortSignal) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': this.apiKey },
      body: JSON.stringify({ q: text, source, target, format: 'text' }),
      signal,
    });
    if (!res.ok) throw new Error(`Google Translation HTTP ${res.status}`);
    const body = (await res.json()) as V2Response;
    const translated = body.data?.translations?.[0]?.translatedText;
    if (!translated) throw new Error('Respuesta de traducción vacía');
    return translated;
  }
}
