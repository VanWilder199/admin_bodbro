import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, parseFieldErrors, setUnauthorizedHandler } from '@/api/client';
import { getToken } from '@/auth/session';
import { authApi } from '@/api/endpoints/auth';
import { moderationApi } from '@/api/endpoints/moderation';
import { BUYER_TOKEN } from '@/mocks/handlers';
import { MOCK_ACCOUNTS, MOCK_TOKEN, MOCK_TOTP_CODE, uuid } from '@/mocks/fixtures/ids';
import { mockControl } from '@/mocks/state';
import { server } from '@/test/server';

function signIn(token = MOCK_TOKEN) {
  localStorage.setItem('podbor.admin.session', JSON.stringify({ accessToken: token, expiresAt: Date.now() + 60_000, email: 'x' }));
}

async function catchApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('Ожидалась ошибка ApiError, но запрос завершился успешно');
}

describe('успешные ответы', () => {
  it('200 с JSON → типизированный объект', async () => {
    signIn();
    const queue = await moderationApi.queue();
    expect(queue).toHaveLength(3);
    expect(queue[0]).toHaveProperty('reportId');
  });

  it('200 с пустым телом → undefined (approve)', async () => {
    signIn();
    await expect(moderationApi.approve(uuid(401))).resolves.toBeUndefined();
  });

  it('204 без тела → undefined', async () => {
    server.use(http.post('/api/test/no-content', () => new HttpResponse(null, { status: 204 })));
    await expect(apiFetch('/test/no-content', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('200 с невалидным JSON → ApiError, а не необработанный SyntaxError', async () => {
    server.use(http.get('/api/test/broken', () => new HttpResponse('{oops', { status: 200 })));
    const err = await catchApiError(apiFetch('/test/broken'));
    expect(err.status).toBe(200);
    expect(err.errorCode).toBeUndefined();
  });

  it('подставляет Bearer-токен из сессии и не требует его для /admin/auth/*', async () => {
    let auth: string | null = 'not-called';
    server.use(http.get('/api/test/echo', ({ request }) => HttpResponse.json({ auth: (auth = request.headers.get('Authorization')) })));

    await apiFetch('/test/echo');
    expect(auth).toBeNull();

    signIn('abc');
    await apiFetch('/test/echo');
    expect(auth).toBe('Bearer abc');
  });

  it('битый JSON в localStorage = сессии нет', () => {
    localStorage.setItem('podbor.admin.session', '{not json');
    expect(getToken()).toBeNull();
  });
});

describe('форма A: ProblemDetail с errorCode', () => {
  it('отдаёт status, errorCode и detail', async () => {
    signIn();
    const err = await catchApiError(moderationApi.approve(uuid(404))); // опубликован → не на модерации
    expect(err.status).toBe(409);
    expect(err.errorCode).toBe('REPORT_NOT_PENDING_REVIEW');
    expect(err.detail).toBe('Report is not pending review');
    expect(err.fieldErrors).toBeUndefined();
  });

  it('404 REPORT_NOT_FOUND для неизвестного отчёта', async () => {
    signIn();
    const err = await catchApiError(moderationApi.report(uuid(999)));
    expect(err.status).toBe(404);
    expect(err.errorCode).toBe('REPORT_NOT_FOUND');
  });

  it('401 на логине — ошибка формы (ADMIN_INVALID_CREDENTIALS), сессию не трогает', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const err = await catchApiError(authApi.login({ email: MOCK_ACCOUNTS.configured.email, password: 'wrong', totpCode: MOCK_TOTP_CODE }));
    expect(err.status).toBe(401);
    expect(err.errorCode).toBe('ADMIN_INVALID_CREDENTIALS');
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('форма A на защищённом пути с 401 (удалённый админ с живым токеном) — это конец сессии', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    signIn();
    mockControl.fail('GET /admin/', { kind: 'app', status: 401, errorCode: 'ADMIN_INVALID_CREDENTIALS' });
    const err = await catchApiError(authApi.me());
    expect(err.errorCode).toBe('ADMIN_INVALID_CREDENTIALS');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe("форма A': ошибка валидации", () => {
  it('errors ["поле: сообщение"] → fieldErrors как объект', async () => {
    signIn();
    const err = await catchApiError(moderationApi.revise(uuid(401), { reasonText: '   ' }));
    expect(err.status).toBe(400);
    expect(err.errorCode).toBe('BAD_REQUEST');
    expect(err.fieldErrors).toEqual({ reasonText: 'must not be blank' });
  });

  it('логин с пустыми полями → ошибки по каждому полю', async () => {
    const err = await catchApiError(authApi.login({ email: '', password: '', totpCode: '' }));
    expect(err.errorCode).toBe('BAD_REQUEST');
    expect(Object.keys(err.fieldErrors ?? {}).sort()).toEqual(['email', 'password', 'totpCode']);
  });

  it('parseFieldErrors: сообщение с двоеточием не теряется, строка без поля уходит в _form', () => {
    expect(parseFieldErrors(['reasonText: must match: a-z', 'общая ошибка'])).toEqual({
      reasonText: 'must match: a-z',
      _form: 'общая ошибка',
    });
    expect(parseFieldErrors([])).toBeUndefined();
    expect(parseFieldErrors('not array')).toBeUndefined();
  });
});

describe('форма B: Spring MVC без errorCode', () => {
  it('невалидный UUID → 400, detail из тела, errorCode нет', async () => {
    signIn();
    const err = await catchApiError(moderationApi.report('abc'));
    expect(err.status).toBe(400);
    expect(err.errorCode).toBeUndefined();
    expect(err.detail).toContain("Failed to convert 'id'");
  });

  it('битое JSON-тело → 400 без errorCode', async () => {
    signIn();
    const err = await catchApiError(apiFetch(`/admin/reports/${uuid(401)}/revise`, { method: 'POST', body: '{not json' }));
    expect(err.status).toBe(400);
    expect(err.errorCode).toBeUndefined();
    expect(err.detail).toBeTruthy();
  });

  it('форма B на защищённом пути не вызывает onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    signIn();
    await catchApiError(moderationApi.report('abc'));
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('форма C: 401/403 из Security', () => {
  it('нет токена → 401, onUnauthorized вызван', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const err = await catchApiError(moderationApi.queue());
    expect(err.status).toBe(401);
    expect(err.errorCode).toBeUndefined();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('токен покупателя → 403, onUnauthorized вызван', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    signIn(BUYER_TOKEN);
    const err = await catchApiError(moderationApi.queue());
    expect(err.status).toBe(403);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('пустое тело 401 (прокси/конфиг без /error) разбирается так же', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    signIn();
    mockControl.fail('GET /admin/reports/queue', { kind: 'security', status: 401, empty: true });
    const err = await catchApiError(moderationApi.queue());
    expect(err.status).toBe(401);
    expect(err.detail).toBe('Unauthorized');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('401/403 на /admin/auth/* (форма C) НЕ вызывают onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    mockControl.fail('POST /admin/auth/login', { kind: 'security', status: 401 });
    mockControl.fail('POST /admin/auth/setup-totp', { kind: 'security', status: 403, empty: true });

    const login = await catchApiError(authApi.login({ email: 'a', password: 'b', totpCode: 'c' }));
    const setup = await catchApiError(authApi.setupTotp({ email: 'a', password: 'b' }));

    expect(login.status).toBe(401);
    expect(setup.status).toBe(403);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('без установленного обработчика 401 не падает сам по себе', async () => {
    setUnauthorizedHandler(undefined);
    const err = await catchApiError(moderationApi.queue());
    expect(err.status).toBe(401);
  });
});

describe('прочие ошибки', () => {
  it('сетевая ошибка → ApiError со status 0 и без вызова onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    signIn();
    mockControl.fail('GET /admin/reports/queue', { kind: 'network' });
    const err = await catchApiError(moderationApi.queue());
    expect(err.status).toBe(0);
    expect(err.errorCode).toBeUndefined();
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('500 INTERNAL_SERVER_ERROR (catch-all бэкенда) — форма A', async () => {
    signIn();
    mockControl.fail('GET /admin/reports/queue', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR', detail: 'An unexpected error occurred' });
    const err = await catchApiError(moderationApi.queue());
    expect(err.status).toBe(500);
    expect(err.errorCode).toBe('INTERNAL_SERVER_ERROR');
  });

  it('502 с HTML от прокси → ApiError с detail по умолчанию', async () => {
    server.use(http.get('/api/test/html', () => new HttpResponse('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })));
    const err = await catchApiError(apiFetch('/test/html'));
    expect(err.status).toBe(502);
    expect(err.errorCode).toBeUndefined();
    expect(err.detail).toBe('Unknown error');
  });

  it('отмена запроса не превращается в ApiError', async () => {
    server.use(http.get('/api/test/slow', async () => new Promise<never>(() => {})));
    const controller = new AbortController();
    const promise = apiFetch('/test/slow', { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
