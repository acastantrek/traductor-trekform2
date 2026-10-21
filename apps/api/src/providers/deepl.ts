import type { Language } from '@ct/shared';
import type { TranslationProvider } from './types.js';

// DeepL API v2. Las claves del plan gratuito terminan en ":fx" y usan otro host.
const FREE_ENDPOINT = 'https://api-free.deepl.com/v2/translate';
const PRO_ENDPOINT = 'https://api.deepl.com/v2/translate';

// DeepL exige variante en inglés, portugués y chino como destino; el origen va sin variante.
const TARGET_CODES: Partial<Record<Language, string>> = { en: 'EN-GB', pt: 'PT-PT', zh: 'ZH-HANS' };

export const deeplTarget = (lang: Language) => TARGET_CODES[lang] ?? lang.toUpperCase();
export const deeplSource = (lang: Language) => lang.toUpperCase();
export const deeplEndpoint = (apiKey: string) => (apiKey.endsWith(':fx') ? FREE_ENDPOINT : PRO_ENDPOINT);

interface DeeplResponse {
  translations?: { text?: string }[];
}

export class DeeplTranslationProvider implements TranslationProvider {
  readonly name = 'deepl';
  private endpoint: string;

  constructor(private apiKey: string) {
    this.endpoint = deeplEndpoint(apiKey);
  }

  async translate(text: string, source: Language, target: Language, signal: AbortSignal) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `DeepL-Auth-Key ${this.apiKey}` },
      body: JSON.stringify({ text: [text], source_lang: deeplSource(source), target_lang: deeplTarget(target) }),
      signal,
    });
    // 456: cuota de caracteres agotada; 429: demasiadas peticiones; 403: clave no válida.
    if (!res.ok) throw new Error(`DeepL HTTP ${res.status}${res.status === 456 ? ' (cuota agotada)' : ''}`);
    const body = (await res.json()) as DeeplResponse;
    const translated = body.translations?.[0]?.text;
    if (!translated) throw new Error('Respuesta de traducción vacía');
    return translated;
  }
}
