import type { AdminPurchaseDetail, AdminReportDetail, InspectorDto, PayoutBatch, PayoutBatchItem, UnbatchedPayout } from '@/api/types';
import { createInspectors } from './fixtures/inspectors';
import { createPayouts } from './fixtures/payouts';
import { createBatchItems, createPurchases, createUnbatched } from './fixtures/purchases';
import { createReportDetails } from './fixtures/reports';
import { MOCK_ACCOUNTS } from './fixtures/ids';

/*
 * Состояние «бэкенда» в моках и управление им. Хендлеры мутируют `db` (approve, verify, pay…),
 * `resetMocks()` возвращает чистые фикстуры — вызывать в `beforeEach` тестов.
 */

export interface MockDb {
  inspectors: InspectorDto[];
  payouts: PayoutBatch[];
  reports: Record<string, AdminReportDetail>;
  purchases: AdminPurchaseDetail[];
  /** Начисления подборщикам, которые ещё не попали в батч. */
  unbatched: UnbatchedPayout[];
  /** uuid батча → его позиции. */
  batchItems: Record<string, PayoutBatchItem[]>;
  /** email → настроен ли TOTP. */
  totpConfigured: Record<string, boolean>;
  /** Email, под которым выполнен последний вход: его отдаёт `GET /admin/`. */
  sessionEmail: string;
}

function createDb(): MockDb {
  return {
    inspectors: createInspectors(),
    payouts: createPayouts(),
    reports: createReportDetails(),
    purchases: createPurchases(),
    unbatched: createUnbatched(),
    batchItems: createBatchItems(),
    totpConfigured: { [MOCK_ACCOUNTS.configured.email]: true, [MOCK_ACCOUNTS.fresh.email]: false },
    sessionEmail: MOCK_ACCOUNTS.configured.email,
  };
}

export const db: MockDb = createDb();

export const mockConfig = {
  /** Задержка ответа, мс. В тестах 0, в браузере её поднимает `browser.ts`. */
  latencyMs: 0,
  /** `expiresIn` ответа логина, секунды. Бэкенд отдаёт 86400; для проверки баннера «сессия истекает» ставят 300. */
  expiresIn: 86_400,
};

// ---------- Принудительные ошибки ----------

/**
 * Какую из форм ошибок бэкенда имитировать:
 *  app        — форма A, `ProblemDetail` с `errorCode`;
 *  validation — форма A', `errorCode: BAD_REQUEST` и `errors: ["поле: сообщение"]`;
 *  spring     — форма B, `ProblemDetail` без `errorCode`;
 *  security   — форма C, 401/403 из Security (JSON Spring Boot или пустое тело);
 *  network    — обрыв соединения (в `fetch` это `TypeError`).
 */
export type MockFailure =
  | { kind: 'app'; status: number; errorCode: string; detail?: string }
  | { kind: 'validation'; errors: string[] }
  | { kind: 'spring'; status: number; detail: string }
  | { kind: 'security'; status: 401 | 403; empty?: boolean }
  | { kind: 'network' };

interface FailureEntry {
  failure: MockFailure;
  once: boolean;
}

const failures = new Map<string, FailureEntry>();

/** Ключ — «МЕТОД шаблон-пути без /api», как в `handlers.ts`: `POST /admin/reports/:id/approve`. */
export const mockControl = {
  /** Все следующие вызовы эндпоинта вернут ошибку, пока не вызван `clear`. */
  fail(key: string, failure: MockFailure) {
    failures.set(key, { failure, once: false });
  },
  /** Ошибка только на ближайший вызов. */
  failOnce(key: string, failure: MockFailure) {
    failures.set(key, { failure, once: true });
  },
  clear(key?: string) {
    if (key) failures.delete(key);
    else failures.clear();
  },
  reset() {
    Object.assign(db, createDb());
    failures.clear();
    mockConfig.latencyMs = 0;
    mockConfig.expiresIn = 86_400;
  },
};

export function resetMocks() {
  mockControl.reset();
}

/** Достаёт ошибку для эндпоинта (и снимает её, если она одноразовая). */
export function takeFailure(key: string): MockFailure | undefined {
  const entry = failures.get(key);
  if (!entry) return undefined;
  if (entry.once) failures.delete(key);
  return entry.failure;
}
