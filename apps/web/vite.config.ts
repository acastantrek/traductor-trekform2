import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const api = process.env.API_URL ?? 'http://localhost:3001';

/** CSP estricta solo en el build (en dev, HMR necesita inline). */
function contentSecurityPolicy(env: Record<string, string>): Plugin {
  const origin = (url?: string) => (url ? new URL(url).origin : '');
  const apiOrigin = origin(env.VITE_API_URL);
  const connect = [
    "'self'",
    origin(env.VITE_SUPABASE_URL),
    apiOrigin,
    apiOrigin.replace(/^http/, 'ws'),
  ].filter(Boolean);
  const policy = [
    "default-src 'self'",
    `connect-src ${[...new Set(connect)].join(' ')}`,
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), contentSecurityPolicy(env)],
    server: {
      // host: true para que los móviles de la misma red puedan abrir la sala.
      host: true,
      port: 5173,
      proxy: {
        '/api': api,
        '/ws': { target: api.replace(/^http/, 'ws'), ws: true },
      },
    },
  };
});
