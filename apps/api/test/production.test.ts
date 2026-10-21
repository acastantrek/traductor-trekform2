import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { FakeAuth, FakeStt, FakeTranslator, MemoryRepository } from './helpers.js';

const supabase = { SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SECRET_KEY: 'test' };
const prod = {
  ...supabase,
  NODE_ENV: 'production',
  ALLOWED_ORIGINS: 'https://app.example.com/',
  DEEPGRAM_API_KEY: 'k',
  GOOGLE_TRANSLATE_API_KEY: 'k',
};

describe('configuración de producción', () => {
  it('exige ALLOWED_ORIGINS', () => {
    expect(() => loadConfig({ ...prod, ALLOWED_ORIGINS: '' })).toThrow(/ALLOWED_ORIGINS/);
  });

  it('rechaza proveedores mock salvo ALLOW_MOCK_PROVIDERS=true', () => {
    const { GOOGLE_TRANSLATE_API_KEY: _, ...noGoogle } = prod;
    expect(() => loadConfig(noGoogle)).toThrow(/mock/);
    expect(loadConfig({ ...noGoogle, ALLOW_MOCK_PROVIDERS: 'true' }).translation.provider).toBe('mock');
  });

  it('normaliza los orígenes y usa proveedores reales con claves', () => {
    const c = loadConfig(prod);
    expect(c).toMatchObject({ production: true, allowedOrigins: ['https://app.example.com'] });
    expect([c.stt.provider, c.translation.provider]).toEqual(['deepgram', 'google']);
  });

  it('DeepL tiene prioridad sobre Google si hay las dos claves', () => {
    expect(loadConfig({ ...prod, DEEPL_API_KEY: 'd:fx' }).translation).toEqual({ provider: 'deepl', apiKey: 'd:fx' });
    expect(() => loadConfig({ ...prod, TRANSLATION_PROVIDER: 'deepl' })).toThrow(/DEEPL_API_KEY/);
  });

  it('en desarrollo funciona sin claves ni orígenes', () => {
    const c = loadConfig(supabase);
    expect(c).toMatchObject({ production: false, allowedOrigins: ['http://localhost:5173'] });
    expect(c.stt.provider).toBe('mock');
  });
});

describe('servidor en producción', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'] | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(env: Record<string, string>) {
    const repo = new MemoryRepository();
    ({ app } = await buildApp({
      config: loadConfig(env),
      stt: new FakeStt(),
      translator: new FakeTranslator(),
      repo,
      auth: new FakeAuth(repo.users),
      logger: false,
    }));
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    return typeof address === 'object' && address ? `127.0.0.1:${address.port}` : '';
  }

  const wsStatus = (url: string, origin?: string) =>
    new Promise<string>((resolve) => {
      const ws = new WebSocket(url, origin ? { origin } : {});
      ws.on('unexpected-response', (_req, res) => resolve(`http ${res.statusCode}`));
      ws.on('close', (code) => resolve(`close ${code}`));
      ws.on('error', () => {});
    });

  it('WebSocket: rechaza orígenes ajenos antes del upgrade', async () => {
    const base = await start(prod);
    expect(await wsStatus(`ws://${base}/ws/student/x?lang=en`, 'https://evil.example')).toBe('http 403');
    expect(await wsStatus(`ws://${base}/ws/student/x?lang=en`)).toBe('http 403');
    // Origen propio: pasa el filtro y llega a la lógica de sesión (no existe → 4404).
    expect(await wsStatus(`ws://${base}/ws/student/x?lang=en`, 'https://app.example.com')).toBe('close 4404');
  });

  it('CORS: la web (otro origen) puede usar PATCH y PUT; orígenes ajenos no', async () => {
    const base = await start(prod);
    const preflight = (origin: string, method: string) =>
      fetch(`http://${base}/api/courses/x`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization' },
      });
    for (const method of ['PATCH', 'PUT']) {
      const res = await preflight('https://app.example.com', method);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
      expect(res.headers.get('access-control-allow-methods')).toContain(method);
    }
    expect((await preflight('https://evil.example', 'PATCH')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('cabeceras de seguridad y rate limit', async () => {
    const base = await start({ ...prod, RATE_LIMIT_PER_MINUTE: '3' });
    const first = await fetch(`http://${base}/api/health`);
    expect(first.headers.get('x-content-type-options')).toBe('nosniff');
    expect(first.headers.get('content-security-policy')).toContain("default-src 'none'");
    await fetch(`http://${base}/api/health`);
    await fetch(`http://${base}/api/health`);
    const limited = await fetch(`http://${base}/api/health`);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: 'rate_limited' });
  });

  it('errores de cliente no se convierten en 500', async () => {
    const base = await start(prod);
    const bad = await fetch(`http://${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' },
      body: '{no json',
    });
    expect(bad.status).toBe(400);
    const big = await fetch(`http://${base}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: 'a'.repeat(20_000) }),
    });
    expect(big.status).toBe(413);
  });
});
