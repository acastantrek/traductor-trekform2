import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Supabase local: mismas credenciales que el desarrollo (apps/*/.env).
for (const file of ['apps/api/.env', 'apps/web/.env']) if (existsSync(file)) process.loadEnvFile(file);

// Puertos propios para no chocar con `npm run dev` (3001/5173).
const API_PORT = 3101;
const WEB_PORT = 5199;

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
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    permissions: ['microphone'],
    launchOptions: {
      // Micrófono simulado: Chrome genera un tono continuo como entrada de audio.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run start -w @ct/api',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
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
      env: { API_URL: `http://localhost:${API_PORT}` },
    },
  ],
});
