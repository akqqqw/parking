import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/** Отдельный конфиг для офлайн-скриптов (генератор уровней). */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tools/**/*.gen.ts'],
    testTimeout: 900_000,
    hookTimeout: 900_000,
    reporters: 'verbose',
  },
});
