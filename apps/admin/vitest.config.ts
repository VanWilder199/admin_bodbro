import path from 'path';
import { defineConfig } from 'vitest/config';

// Отдельный конфиг для тестов: Tailwind и React-плагин им не нужны.
// happy-dom даёт `localStorage` и `location` — по ним MSW разворачивает относительные URL `/api/...`.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    // threads, а не forks: в песочнице нельзя убивать дочерние процессы (kill EPERM), и воркеры остались бы висеть
    pool: 'threads',
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'http://localhost:5174' } },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
