import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Supabase local: mismas credenciales que el desarrollo (apps/*/.env).
for (const file of ['apps/api/.env', 'apps/web/.env']) if (existsSync(file)) process.loadEnvFile(file);

// Puertos propios para no chocar con `npm run dev` (3001/5173).
const API_PORT = 3101;
const WEB_PORT = 5199; // Vite dev con proxy (/api, /ws en el mismo origen)
const BUILD_PORT = 5299; // build de producción: CSP y API en otro origen, como en el despliegue
const API = `http://localhost:${API_PORT}`;

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Comparten una única API en memoria y la misma BD: en serie.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  outputDir: 'e2e/results',
  globalSetup: './e2e/global-setup.ts',
  use: {
    trace: 'retain-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      // Micrófono simulado: Chrome genera un tono continuo como entrada de audio.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [
    { name: 'dev', use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${WEB_PORT}` } },
    { name: 'build', use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${BUILD_PORT}` } },
  ],
  webServer: [
    {
      command: 'npm run start:ts -w @ct/api',
      url: `${API}/api/health`,
      reuseExistingServer: false,
      env: {
        // Modo producción: CORS y filtro de origen de WebSocket activos.
        NODE_ENV: 'production',
        ALLOW_MOCK_PROVIDERS: 'true',
        ALLOWED_ORIGINS: `http://localhost:${WEB_PORT},http://localhost:${BUILD_PORT}`,
        RATE_LIMIT_PER_MINUTE: '10000',
        PORT: String(API_PORT),
        STT_PROVIDER: 'mock',
        TRANSLATION_PROVIDER: 'mock',
        LANGUAGE_GRACE_MS: '2000',
        CLOSE_ORPHANS_ON_START: 'false',
      },
    },
    {
      command: `npm run dev -w @ct/web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { API_URL: API },
    },
    {
      command: `npm run build -w @ct/web && npm run preview -w @ct/web -- --port ${BUILD_PORT} --strictPort`,
      url: `http://localhost:${BUILD_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: API },
    },
  ],
});
