import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeeplTranslationProvider, deeplEndpoint, deeplTarget } from '../src/providers/deepl.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('DeepL', () => {
  it('elige el host según el tipo de clave', () => {
    expect(deeplEndpoint('abc:fx')).toBe('https://api-free.deepl.com/v2/translate');
    expect(deeplEndpoint('abc')).toBe('https://api.deepl.com/v2/translate');
  });

  it('usa variantes de destino donde DeepL las exige', () => {
    expect(deeplTarget('en')).toBe('EN-GB');
    expect(deeplTarget('pt')).toBe('PT-PT');
    expect(deeplTarget('zh')).toBe('ZH-HANS');
    expect(deeplTarget('fr')).toBe('FR');
  });

  it('envía la clave y los idiomas y devuelve el texto traducido', async () => {
    const fetchMock = stubFetch(200, { translations: [{ detected_source_language: 'ES', text: 'Hello' }] });
    const provider = new DeeplTranslationProvider('clave:fx');
    await expect(provider.translate('Hola', 'es', 'en', new AbortController().signal)).resolves.toBe('Hello');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api-free.deepl.com/v2/translate');
    expect(new Headers(init.headers).get('Authorization')).toBe('DeepL-Auth-Key clave:fx');
    expect(JSON.parse(init.body as string)).toEqual({ text: ['Hola'], source_lang: 'ES', target_lang: 'EN-GB' });
  });

  it('falla con un error claro si se agota la cuota o la respuesta viene vacía', async () => {
    const provider = new DeeplTranslationProvider('clave');
    stubFetch(456, { message: 'Quota exceeded' });
    await expect(provider.translate('Hola', 'es', 'fr', new AbortController().signal)).rejects.toThrow(/456.*cuota/);
    stubFetch(200, { translations: [] });
    await expect(provider.translate('Hola', 'es', 'fr', new AbortController().signal)).rejects.toThrow(/vacía/);
  });
});
