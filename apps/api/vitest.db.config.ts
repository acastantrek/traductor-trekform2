import { defineConfig } from 'vitest/config';

// Integración contra Supabase local (npx supabase start). Nunca contra producción.
export default defineConfig({ test: { include: ['test-db/**/*.test.ts'], testTimeout: 20_000 } });
