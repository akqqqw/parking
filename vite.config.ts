import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * Запись ручных уровней из скрытой админ-панели в файл проекта.
 *
 * Работает только на dev-сервере (`apply: 'serve'`): в собранной игре кнопка
 * «Записать в файл проекта» честно сообщает, что файл недоступен, а правки
 * остаются в localStorage. Файл затем можно закоммитить.
 */
function customLevelsPlugin(): Plugin {
  const file = fileURLToPath(new URL('./src/game/levels/custom-levels.json', import.meta.url));
  return {
    name: 'parking-custom-levels',
    apply: 'serve',
    configureServer(server) {
      // Файл пишется из самой игры: слежение за ним перезагружало бы страницу
      // и выкидывало из редактора. Значения применятся при следующем запуске
      // или сборке; в текущей сессии уже работает localStorage.
      server.watcher.unwatch(file);
      server.middlewares.use('/__admin/levels', (request, response) => {
        const reply = (status: number, payload: unknown): void => {
          response.statusCode = status;
          response.setHeader('content-type', 'application/json; charset=utf-8');
          response.end(JSON.stringify(payload));
        };
        if (request.method !== 'POST') {
          reply(405, { ok: false, error: 'Только POST' });
          return;
        }
        let body = '';
        let tooLarge = false;
        request.on('data', (chunk: Buffer) => {
          if (tooLarge) return;
          body += chunk.toString('utf8');
          if (body.length > 2_000_000) {
            tooLarge = true;
            reply(413, { ok: false, error: 'Файл слишком большой' });
          }
        });
        request.on('end', () => {
          if (tooLarge) return;
          try {
            const parsed = JSON.parse(body) as { levels?: unknown };
            if (!Array.isArray(parsed.levels)) throw new Error('Нет массива levels');
            const payload = `${JSON.stringify({ version: 1, levels: parsed.levels }, null, 2)}\n`;
            // Сначала отвечаем: запись файла перезапускает HMR и может оборвать запрос.
            reply(200, { ok: true, count: parsed.levels.length });
            setTimeout(() => writeFileSync(file, payload, 'utf8'), 120);
          } catch (error) {
            reply(400, {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), customLevelsPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    // Dev-server is proxied through a preview host, so any Host header must be accepted.
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
