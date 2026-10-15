import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Компонентные тесты помечают файл как jsdom через `@vitest-environment`.
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    reporters: 'default',
  },
});
