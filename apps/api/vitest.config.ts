import { defineConfig } from 'vitest/config';

// Tests unitarios y de API sin dependencias externas.
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
