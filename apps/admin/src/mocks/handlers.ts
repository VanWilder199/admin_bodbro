import { delay, http, HttpResponse, type HttpResponseResolver, type PathParams } from 'msw';
import { ADMIN_ID, isUuid } from './fixtures/ids';
import { MOCK_ACCOUNTS, MOCK_TOKEN, MOCK_TOTP_CODE } from './fixtures/ids';
import { ADMIN_EMAIL } from './fixtures/reports';
import { db, mockConfig, takeFailure, type MockFailure } from './state';
import type { AdminStats, InspectorStatus, ModerationHistoryEntry, ModerationQueueItem, PayoutStatus, PurchaseStatus, ReportListItem, ReportStatus } from '@/api/types';

/*
 * MSW-хендлеры, повторяющие админский бэкенд (PLAN_FRONTEND_ADMIN.md, раздел 2): те же пути, те же
 * проверки в том же порядке, те же коды и формы ошибок. Префикс `/api` — как у клиента (`api/client.ts`).
 */

const API = '/api';

/** Токен покупателя: валиден, но роль не ADMIN → 403 из Security. */
export const BUYER_TOKEN = 'buyer-token';

// ---------- Ответы ----------

function problem(status: number, title: string, detail: string, path: string, extra: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { type: 'about:blank', title, status, detail, instance: path, ...extra },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

/** Форма A: `AppException` → `ProblemDetail` с `errorCode`. */
function appError(status: number, errorCode: string, detail: string, path: string) {
  return problem(status, detail, detail, path, { type: `/errors/${errorCode.toLowerCase()}`, timestamp: new Date().toISOString(), path, errorCode });
}

/** Форма A': ошибка `@Valid`, `errors` — массив строк «поле: сообщение». */
function validationError(errors: string[], path: string) {
  return problem(400, 'Bad Request', 'Validation failed', path, { errors, errorCode: 'BAD_REQUEST' });
}

/** Форма B: стандартная ошибка Spring MVC без `errorCode`. */
function springError(status: number, detail: string, path: string) {
  return problem(status, status === 404 ? 'Not Found' : 'Bad Request', detail, path);
}

/** Форма C: 401/403 из Security. Тело — JSON Spring Boot `/error`, а при смене конфига или прокси может быть пустым. */
function securityError(status: 401 | 403, path: string, empty = false) {
  if (empty) return new HttpResponse(null, { status });
  return HttpResponse.json({ timestamp: new Date().toISOString(), status, error: status === 401 ? 'Unauthorized' : 'Forbidden', path }, { status });
}

function emptyOk() {
  return new HttpResponse(null, { status: 200 });
}

function failureResponse(failure: MockFailure, path: string) {
  switch (failure.kind) {
    case 'app':
      return appError(failure.status, failure.errorCode, failure.detail ?? failure.errorCode, path);
    case 'validation':
      return validationError(failure.errors, path);
    case 'spring':
      return springError(failure.status, failure.detail, path);
    case 'security':
      return securityError(failure.status, path, failure.empty);
    case 'network':
      return HttpResponse.error();
  }
}

// ---------- Обёртка эндпоинта ----------

type Method = 'get' | 'post';

interface RouteOptions {
  /** Эндпоинт без JWT (`/admin/auth/**`). */
  public?: boolean;
}

/**
 * Порядок как в Spring: JWT-фильтр (401/403) → принудительная ошибка из `mockControl` → сам эндпоинт.
 * Ключ для `mockControl.fail`: `METHOD /шаблон/пути` (без `/api`).
 */
function route(method: Method, pattern: string, resolver: HttpResponseResolver<PathParams>, options: RouteOptions = {}) {
  const key = `${method.toUpperCase()} ${pattern}`;
  const handler = method === 'get' ? http.get : http.post;

  return handler(`${API}${pattern}`, async (info) => {
    // при нулевой задержке не трогаем таймеры вообще: иначе тесты с фейковыми часами зависают на delay(0)
    if (mockConfig.latencyMs > 0) await delay(mockConfig.latencyMs);
    const path = new URL(info.request.url).pathname.replace(/^\/api/, '');

    if (!options.public) {
      const header = info.request.headers.get('Authorization');
      const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
      if (token === BUYER_TOKEN) return securityError(403, path);
      if (token !== MOCK_TOKEN) return securityError(401, path);
    }

    const failure = takeFailure(key);
    if (failure) return failureResponse(failure, path);

    return resolver(info);
  });
}

// ---------- Разбор запроса ----------

/** Невалидный UUID в пути → форма B (`MethodArgumentTypeMismatchException`). */
function badId(id: unknown, path: string) {
  const value = String(id);
  return isUuid(value) ? null : springError(400, `Failed to convert 'id' with value: '${value}'`, path);
}

type Parsed<T> = { ok: true; body: T } | { ok: false; response: Response };

/** Пустое или битое JSON-тело → форма B; пустое обязательное поле → форма A'. */
async function readBody<T extends Record<string, unknown>>(request: Request, field: keyof T & string, path: string): Promise<Parsed<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: springError(400, 'Failed to read request', path) };
  }
  const value = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[field] : undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, response: validationError([`${field}: must not be blank`], path) };
  }
  return { ok: true, body: body as T };
}

const pathOf = (request: Request) => new URL(request.url).pathname.replace(/^\/api/, '');

// ---------- Auth ----------

function blankFields(body: Record<string, unknown>, fields: string[]): string[] {
  return fields.filter((f) => typeof body[f] !== 'string' || (body[f] as string).trim() === '').map((f) => `${f}: must not be blank`);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const authHandlers = [
  // Порядок проверок как в AdminAuthServiceImpl: пустые поля → пароль → TOTP настроен → код.
  route(
    'post',
    '/admin/auth/login',
    async ({ request }) => {
      const path = pathOf(request);
      const body = await readJson(request);
      if (!body) return springError(400, 'Failed to read request', path);

      const blank = blankFields(body, ['email', 'password', 'totpCode']);
      if (blank.length > 0) return validationError(blank, path);

      const email = String(body.email).toLowerCase();
      const account = Object.values(MOCK_ACCOUNTS).find((a) => a.email === email);
      if (!account || account.password !== body.password) {
        return appError(401, 'ADMIN_INVALID_CREDENTIALS', 'Invalid credentials', path);
      }
      if (!db.totpConfigured[account.email]) {
        return appError(409, 'ADMIN_TOTP_NOT_CONFIGURED', 'TOTP is not configured', path);
      }
      if (body.totpCode !== MOCK_TOTP_CODE) {
        return appError(401, 'ADMIN_TOTP_INVALID', 'Invalid TOTP code', path);
      }

      db.sessionEmail = account.email;
      return HttpResponse.json({ accessToken: MOCK_TOKEN, expiresIn: mockConfig.expiresIn });
    },
    { public: true },
  ),

  route(
    'post',
    '/admin/auth/setup-totp',
    async ({ request }) => {
      const path = pathOf(request);
      const body = await readJson(request);
      if (!body) return springError(400, 'Failed to read request', path);

      const blank = blankFields(body, ['email', 'password']);
      if (blank.length > 0) return validationError(blank, path);

      const email = String(body.email).toLowerCase();
      const account = Object.values(MOCK_ACCOUNTS).find((a) => a.email === email);
      if (!account || account.password !== body.password) {
        return appError(401, 'ADMIN_INVALID_CREDENTIALS', 'Invalid credentials', path);
      }
      if (db.totpConfigured[account.email]) {
        return appError(409, 'ADMIN_TOTP_ALREADY_CONFIGURED', 'TOTP is already configured', path);
      }

      // Секрет пишется в БД сразу, до подтверждения кодом: второй вызов уже даст 409.
      db.totpConfigured[account.email] = true;
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      return HttpResponse.json({
        secret,
        otpAuthUrl: `otpauth://totp/Marketplace%20Admin:${encodeURIComponent(account.email)}?secret=${secret}&issuer=Marketplace+Admin&algorithm=SHA1&digits=6&period=30`,
      });
    },
    { public: true },
  ),

  // Путь со слэшем. Без слэша бэкенд отвечает 404 (trailing slash matching в Spring Boot 3 выключен, форма B) —
  // моки повторяют это отдельным хендлером ниже, иначе опечатка в пути осталась бы незамеченной.
  route('get', '/admin/', () => HttpResponse.json({ id: '00000000-0000-4000-8000-000000000900', email: db.sessionEmail })),
  route('get', '/admin', ({ request }) => springError(404, 'No static resource admin.', pathOf(request))),
];

// ---------- Moderation ----------

const REVIEWABLE = 'pending_review';

function isDeleted(reportId: string): boolean {
  return db.reports[reportId]?.deletedAt != null;
}

/** Запись в журнал модерации и в `ModerationHistoryEntry` с почтой админа (BE-2). */
function logEntry(action: ModerationHistoryEntry['action'], reason: string | null): ModerationHistoryEntry {
  return { adminId: ADMIN_ID, adminEmail: ADMIN_EMAIL, action, reason, createdAt: new Date().toISOString() };
}

function inspectorOf(inspectorId: string) {
  return db.inspectors.find((i) => i.id === inspectorId);
}

const moderationHandlers = [
  // Только pending_review и не удалённые, сортировка по реальной дате отправки ASC (BE-3: `reports.submitted_at`).
  route('get', '/admin/reports/queue', () => {
    const queue: ModerationQueueItem[] = Object.values(db.reports)
      .filter(({ report }) => report.status === REVIEWABLE && !isDeleted(report.id))
      .map(({ report, car, submittedAt, history }) => ({
        reportId: report.id,
        carId: report.carId,
        vin: car.vin,
        make: car.make,
        model: car.model,
        year: car.year,
        inspectorId: report.inspectorId,
        inspectorName: inspectorOf(report.inspectorId)?.fullName ?? '',
        inspectorStatus: inspectorOf(report.inspectorId)?.status ?? 'pending',
        priceByn: report.priceByn,
        resubmitted: history.some((h) => h.action === 'revise'),
        versionNo: report.versionNo,
        submittedAt: submittedAt ?? '2026-09-27T00:00:00.000Z',
      }))
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    return HttpResponse.json(queue);
  }),

  // Реестр всех отчётов (BE-5): массив целиком, фильтры и поиск делает клиент. Свежие сверху.
  route('get', '/admin/reports', () => {
    const items: ReportListItem[] = Object.values(db.reports)
      .map(({ report, car, createdAt, submittedAt, deletedAt, paidPurchasesCount }) => ({
        reportId: report.id,
        status: report.status as ReportStatus,
        deletedAt,
        carId: report.carId,
        vin: car.vin,
        make: car.make,
        model: car.model,
        year: car.year,
        inspectorId: report.inspectorId,
        inspectorName: inspectorOf(report.inspectorId)?.fullName ?? '',
        priceByn: report.priceByn,
        createdAt,
        submittedAt,
        paidPurchasesCount,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(items);
  }),

  // Отдаёт отчёт в любом статусе, включая удалённые.
  route('get', '/admin/reports/:id', ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const detail = db.reports[String(params.id)];
    if (!detail) return appError(404, 'REPORT_NOT_FOUND', 'Report not found', path);
    // Подборщик читается из актуального списка: верификация или бан после создания фикстуры должны быть видны в карточке
    const inspector = inspectorOf(detail.report.inspectorId);
    return HttpResponse.json(inspector ? { ...detail, inspector: { id: inspector.id, fullName: inspector.fullName, phone: inspector.phone, email: inspector.email, status: inspector.status } } : detail);
  }),

  route('post', '/admin/reports/:id/approve', ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const detail = db.reports[String(params.id)];
    if (!detail) return appError(404, 'REPORT_NOT_FOUND', 'Report not found', path);
    if (isDeleted(detail.report.id)) return appError(409, 'REPORT_ALREADY_DELETED', 'Report is already deleted', path);
    if (detail.report.status !== REVIEWABLE) return appError(409, 'REPORT_NOT_PENDING_REVIEW', 'Report is not pending review', path);

    detail.report.status = 'published';
    detail.history.unshift(logEntry('approve', null));
    return emptyOk();
  }),

  route('post', '/admin/reports/:id/revise', async ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const parsed = await readBody<{ reasonText: string }>(request, 'reasonText', path);
    if (!parsed.ok) return parsed.response;

    const detail = db.reports[String(params.id)];
    if (!detail) return appError(404, 'REPORT_NOT_FOUND', 'Report not found', path);
    if (isDeleted(detail.report.id)) return appError(409, 'REPORT_ALREADY_DELETED', 'Report is already deleted', path);
    if (detail.report.status !== REVIEWABLE) return appError(409, 'REPORT_NOT_PENDING_REVIEW', 'Report is not pending review', path);

    detail.report.status = 'revision_required';
    detail.history.unshift(logEntry('revise', parsed.body.reasonText));
    return emptyOk();
  }),

  // Удалить можно из любого статуса; статус не меняется, признак — запись `delete` в истории.
  route('post', '/admin/reports/:id/delete', async ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const parsed = await readBody<{ reasonText: string }>(request, 'reasonText', path);
    if (!parsed.ok) return parsed.response;

    const detail = db.reports[String(params.id)];
    if (!detail) return appError(404, 'REPORT_NOT_FOUND', 'Report not found', path);
    if (isDeleted(detail.report.id)) return appError(409, 'REPORT_ALREADY_DELETED', 'Report is already deleted', path);

    const entry = logEntry('delete', parsed.body.reasonText);
    detail.history.unshift(entry);
    detail.deletedAt = entry.createdAt;
    return emptyOk();
  }),
];

// ---------- Inspectors ----------

const inspectorHandlers = [
  // Неизвестный статус не ошибка, а пустой список.
  route('get', '/admin/inspectors', ({ request }) => {
    const status = new URL(request.url).searchParams.get('status') as InspectorStatus | null;
    return HttpResponse.json(status ? db.inspectors.filter((i) => i.status === status) : db.inspectors);
  }),

  route('post', '/admin/inspectors/:id/verify', ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const inspector = db.inspectors.find((i) => i.id === params.id);
    if (!inspector) return appError(404, 'INSPECTOR_NOT_FOUND', 'Inspector not found', path);
    if (inspector.status !== 'pending') return appError(409, 'INSPECTOR_NOT_PENDING', 'Inspector is not pending', path);

    inspector.status = 'verified';
    return HttpResponse.json(inspector);
  }),

  // Тело бана — `reason`, не `reasonText`. Забанить можно pending и verified, обратного перехода нет.
  route('post', '/admin/inspectors/:id/ban', async ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const parsed = await readBody<{ reason: string }>(request, 'reason', path);
    if (!parsed.ok) return parsed.response;

    const inspector = db.inspectors.find((i) => i.id === params.id);
    if (!inspector) return appError(404, 'INSPECTOR_NOT_FOUND', 'Inspector not found', path);
    if (inspector.status === 'banned') return appError(409, 'INSPECTOR_ALREADY_BANNED', 'Inspector is already banned', path);

    inspector.status = 'banned';
    return HttpResponse.json(inspector);
  }),
];

// ---------- Payouts ----------

let batchCounter = 0;

/** Делит сумму на `count` позиций так, чтобы они в сумме дали ровно `amount` (остаток уходит в последнюю). */
function splitAmount(amount: number, count: number): number[] {
  const part = Math.floor(amount / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? amount - part * (count - 1) : part));
}

const payoutHandlers = [
  route('get', '/admin/payouts', ({ request }) => {
    const status = new URL(request.url).searchParams.get('status') as PayoutStatus | null;
    return HttpResponse.json(status ? db.payouts.filter((p) => p.status === status) : db.payouts);
  }),

  // Начисления, ещё не попавшие в батч (BE-8). Статические пути объявлены раньше `/:id`.
  route('get', '/admin/payouts/unbatched', () => HttpResponse.json(db.unbatched)),

  // Сформировать батчи вручную: каждое накопление подборщика становится батчем `pending` (BE-8).
  route('post', '/admin/payouts/run-batches', () => {
    const created = db.unbatched.map((entry) => {
      batchCounter += 1;
      const batchUuid = `00000000-0000-4000-8000-${String(900000 + batchCounter).padStart(12, '0')}`;
      const inspector = inspectorOf(entry.inspectorId);
      db.payouts.unshift({
        uuid: batchUuid,
        inspectorId: entry.inspectorId,
        inspectorName: entry.inspectorName,
        inspectorEmail: inspector?.email ?? '',
        periodStart: '2026-10-01T00:00:00Z',
        periodEnd: '2026-10-31T23:59:59Z',
        amountByn: entry.amountByn,
        status: 'pending',
        createdAt: new Date().toISOString(),
        paidAt: null,
      });
      db.batchItems[batchUuid] = splitAmount(entry.amountByn, entry.count).map((amountByn, i) => ({
        purchaseId: `00000000-0000-4000-8000-${String(800000 + batchCounter * 10 + i).padStart(12, '0')}`,
        reportId: '00000000-0000-4000-8000-000000000404',
        amountByn,
        createdAt: new Date().toISOString(),
      }));
      return entry.amountByn;
    });
    db.unbatched = [];
    return HttpResponse.json({ batchesCreated: created.length, totalAmountByn: created.reduce((sum, amount) => sum + amount, 0) });
  }),

  // Состав батча (BE-8).
  route('get', '/admin/payouts/:id', ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const batch = db.payouts.find((p) => p.uuid === params.id);
    if (!batch) return appError(404, 'PAYOUT_NOT_FOUND', 'Payout batch not found', path);
    return HttpResponse.json({ ...batch, items: db.batchItems[batch.uuid] ?? [] });
  }),

  // Повторная оплата и неизвестный uuid отвечают одинаково: 404 PAYOUT_NOT_FOUND (обновилось 0 строк).
  route('post', '/admin/payouts/:id/pay', ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const batch = db.payouts.find((p) => p.uuid === params.id);
    if (!batch || batch.status !== 'pending') return appError(404, 'PAYOUT_NOT_FOUND', 'Payout batch not found', path);

    batch.status = 'paid';
    batch.paidAt = new Date().toISOString();
    return emptyOk();
  }),
];

// ---------- Purchases ----------

const PURCHASE_STATUSES: readonly PurchaseStatus[] = ['pending', 'paid', 'failed'];

const purchaseHandlers = [
  // Массив целиком, как у подборщиков: статус фильтрует сервер, поиск по покупателю — клиент. Свежие сверху.
  route('get', '/admin/purchases', ({ request }) => {
    const path = pathOf(request);
    const status = new URL(request.url).searchParams.get('status');
    if (status && !PURCHASE_STATUSES.includes(status as PurchaseStatus)) return springError(400, `Unknown status: ${status}`, path);
    const list = status ? db.purchases.filter((p) => p.status === status) : db.purchases;
    return HttpResponse.json([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ payout: _payout, ...purchase }) => purchase));
  }),

  // Сверка зависших платежей с bePaid (BE-8): `pending` старше нескольких минут проверяются, первый оплачен, остальные отклонены.
  route('post', '/admin/purchases/reconcile', () => {
    const stuck = db.purchases.filter((p) => p.status === 'pending');
    let markedPaid = 0;
    let markedFailed = 0;
    stuck.forEach((purchase, index) => {
      if (index === 0) {
        purchase.status = 'paid';
        purchase.paidAt = new Date().toISOString();
        purchase.accessTokenExpiresAt = '2027-01-01T00:00:00Z';
        purchase.payout = { id: `00000000-0000-4000-8000-${String(610 + index).padStart(12, '0')}`, amountByn: Math.round(purchase.amountByn / 2), payoutBatchId: null };
        markedPaid += 1;
      } else {
        purchase.status = 'failed';
        markedFailed += 1;
      }
    });
    return HttpResponse.json({ checked: stuck.length, markedPaid, markedFailed });
  }),

  route('get', '/admin/purchases/:id', ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const purchase = db.purchases.find((p) => p.id === params.id);
    if (!purchase) return appError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found', path);
    return HttpResponse.json(purchase);
  }),

  // Отозвать ссылку можно только у оплаченной покупки; повторный отзыв не меняет дату.
  route('post', '/admin/purchases/:id/revoke-access', async ({ request, params }) => {
    const path = pathOf(request);
    const bad = badId(params.id, path);
    if (bad) return bad;
    const parsed = await readBody<{ reason: string }>(request, 'reason', path);
    if (!parsed.ok) return parsed.response;

    const purchase = db.purchases.find((p) => p.id === params.id);
    if (!purchase) return appError(404, 'PURCHASE_NOT_FOUND', 'Purchase not found', path);
    if (purchase.status !== 'paid') return appError(409, 'PURCHASE_NOT_PAID', 'Purchase is not paid', path);

    purchase.accessRevokedAt ??= new Date().toISOString();
    return HttpResponse.json({ accessRevokedAt: purchase.accessRevokedAt });
  }),
];

// ---------- Stats ----------

const statsHandlers = [
  // Дашборд (BE-6): все числа считаются из текущего состояния моков, поэтому меняются после мутаций.
  route('get', '/admin/stats', () => {
    const reports = Object.values(db.reports).filter((d) => d.deletedAt == null);
    const pendingBatches = db.payouts.filter((p) => p.status === 'pending');
    const paid = db.purchases.filter((p) => p.status === 'paid');
    const stats: AdminStats = {
      pendingReview: reports.filter((d) => d.report.status === 'pending_review').length,
      revisionRequired: reports.filter((d) => d.report.status === 'revision_required').length,
      inspectorsPending: db.inspectors.filter((i) => i.status === 'pending').length,
      payoutBatchesPending: pendingBatches.length,
      payoutBatchesPendingAmountByn: pendingBatches.reduce((sum, p) => sum + p.amountByn, 0),
      unbatchedPayoutsAmountByn: db.unbatched.reduce((sum, u) => sum + u.amountByn, 0),
      purchasesPaidLast30d: paid.length,
      revenueLast30dByn: paid.reduce((sum, p) => sum + p.amountByn, 0),
      purchasesStuckPending: db.purchases.filter((p) => p.status === 'pending').length,
    };
    return HttpResponse.json(stats);
  }),
];

export const handlers = [...authHandlers, ...moderationHandlers, ...inspectorHandlers, ...payoutHandlers, ...purchaseHandlers, ...statsHandlers];
