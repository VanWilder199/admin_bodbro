import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setUnauthorizedHandler } from '@/api/client';
import { resetMocks } from '@/mocks/state';
import { server } from './server';

// Запрос мимо хендлеров — ошибка теста, а не тихий поход в сеть.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

afterEach(() => {
  // RTL сам подписывается на afterEach только при vitest `globals: true`, поэтому чистим вручную
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  resetMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.title = ''; // заголовок переживает тест, и проверки «title сменился» проходили бы на чужом значении
  setUnauthorizedHandler(undefined);
});

// happy-dom не отдаёт `style.transform`, а vaul (Drawer) делает по нему `.match(...)` при отпускании указателя.
const nativeGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
  const style = nativeGetComputedStyle(element, pseudo);
  if (!style.transform) {
    try {
      Object.defineProperty(style, 'transform', { value: 'none', configurable: true });
    } catch {
      // объект стилей запечатан — оставляем как есть
    }
  }
  return style;
}) as typeof window.getComputedStyle;

afterAll(() => server.close());
