import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { mockConfig, mockControl, resetMocks } from './state';

export const worker = setupWorker(...handlers);

/** Правдоподобная задержка сети, чтобы в UI были видны состояния загрузки. */
mockConfig.latencyMs = 300;

/**
 * Управление моками из консоли браузера (только в режиме `VITE_API_MOCKS=1`), например:
 *   __mocks.control.failOnce('POST /admin/reports/:id/approve', { kind: 'app', status: 409, errorCode: 'REPORT_NOT_PENDING_REVIEW' })
 *   __mocks.config.expiresIn = 300   // сессия на 5 минут — проверить баннер и автовыход
 *   __mocks.reset()
 */
declare global {
  interface Window {
    __mocks?: { control: typeof mockControl; config: typeof mockConfig; reset: () => void };
  }
}

window.__mocks = { control: mockControl, config: mockConfig, reset: resetMocks };
