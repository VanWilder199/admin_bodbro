import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError, apiFetch } from '@/api/client';
import { authApi } from '@/api/endpoints/auth';
import { inspectorsApi } from '@/api/endpoints/inspectors';
import { moderationApi } from '@/api/endpoints/moderation';
import { payoutsApi } from '@/api/endpoints/payouts';
import { MOCK_ACCOUNTS, MOCK_TOKEN, MOCK_TOTP_CODE, uuid } from '@/mocks/fixtures/ids';

/* Моки должны вести себя как настоящий бэкенд — иначе экраны ADM-03…ADM-10 разработаются под выдуманный контракт. */

const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (e) {
    return e instanceof ApiError ? e.errorCode : `не ApiError: ${String(e)}`;
  }
  return 'OK';
};

beforeEach(() => {
  localStorage.setItem('podbor.admin.session', JSON.stringify({ accessToken: MOCK_TOKEN, expiresAt: Date.now() + 60_000, email: 'x' }));
});

describe('auth', () => {
  const { configured, fresh } = MOCK_ACCOUNTS;

  it('login: верные данные → токен и expiresIn в секундах', async () => {
    const res = await authApi.login({ ...configured, totpCode: MOCK_TOTP_CODE });
    expect(res).toEqual({ accessToken: MOCK_TOKEN, expiresIn: 86_400 });
  });

  it('login: порядок проверок — пароль → TOTP не настроен → неверный код', async () => {
    expect(await code(authApi.login({ email: configured.email, password: 'wrong', totpCode: '000000' }))).toBe('ADMIN_INVALID_CREDENTIALS');
    expect(await code(authApi.login({ ...fresh, totpCode: MOCK_TOTP_CODE }))).toBe('ADMIN_TOTP_NOT_CONFIGURED');
    expect(await code(authApi.login({ ...configured, totpCode: '000000' }))).toBe('ADMIN_TOTP_INVALID');
  });

  it('login: email регистронезависим (citext)', async () => {
    await expect(authApi.login({ email: configured.email.toUpperCase(), password: configured.password, totpCode: MOCK_TOTP_CODE })).resolves.toBeDefined();
  });

  it('setup-totp: otpauth-ссылка, повторный вызов → 409, после настройки логин проходит', async () => {
    const res = await authApi.setupTotp(fresh);
    expect(res?.otpAuthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(res?.secret).toBeTruthy();

    expect(await code(authApi.setupTotp(fresh))).toBe('ADMIN_TOTP_ALREADY_CONFIGURED');
    expect(await code(authApi.login({ ...fresh, totpCode: MOCK_TOTP_CODE }))).toBe('OK');
  });

  it('me: email того, кто вошёл', async () => {
    await authApi.login({ ...configured, totpCode: MOCK_TOTP_CODE });
    await expect(authApi.me()).resolves.toMatchObject({ email: configured.email });
  });

  it('GET /admin без завершающего слэша → 404 формы B, а /admin/ отвечает', async () => {
    await expect(apiFetch('/admin/')).resolves.toBeDefined();
    const err = await apiFetch('/admin').then(
      () => null,
      (e: unknown) => e as ApiError,
    );
    expect(err?.status).toBe(404);
    expect(err?.errorCode).toBeUndefined();
  });
});

describe('moderation', () => {
  it('очередь: только pending_review и не удалённые, по дате создания, null-поля машины переживаются', async () => {
    const queue = await moderationApi.queue();
    expect(queue.map((i) => i.reportId)).toEqual([uuid(401), uuid(402), uuid(403)]);
    expect(queue[2]).toMatchObject({ vin: null, model: null, year: null, make: 'Skoda' });
  });

  it('карточка отдаёт отчёты в любом статусе, включая удалённый; у медиа есть s3Key и url (BE-1)', async () => {
    const deleted = await moderationApi.report(uuid(405));
    expect(deleted.history[0]?.action).toBe('delete');
    expect(deleted.deletedAt).toBe('2026-09-25T14:00:00Z');
    const photo = deleted.report.sections[0]?.media[0];
    expect(photo).toHaveProperty('s3Key');
    expect(photo?.url).toMatch(/^data:image\/svg\+xml,/);
    // видео в pending смотреть нечего
    expect(deleted.report.globalMedia[1]).toMatchObject({ kind: 'VIDEO', status: 'pending', url: null });
  });

  it('карточка содержит машину, подборщика, даты и счётчики покупателей (BE-2)', async () => {
    const detail = await moderationApi.report(uuid(401));
    expect(detail.car).toMatchObject({ vin: 'WVWZZZ3CZHE123456', avbyListingUrl: expect.stringContaining('av.by') });
    expect(detail.inspector).toMatchObject({ fullName: 'Олег Кравец', status: 'verified' });
    expect(detail).toMatchObject({ waitingBuyersCount: 3, paidPurchasesCount: 0, deletedAt: null });
    expect(detail.submittedAt).toBe('2026-09-27T08:12:44.512Z');
  });

  it('очередь: подборщик, цена, «повторно» и сортировка по дате отправки (BE-3)', async () => {
    const queue = await moderationApi.queue();
    expect(queue[0]).toMatchObject({ inspectorName: 'Олег Кравец', inspectorStatus: 'verified', priceByn: 500_000, resubmitted: false });
    expect(queue[1]).toMatchObject({ reportId: uuid(402), resubmitted: true });
  });

  it('approve: убирает из очереди, пишет историю; повторный → 409', async () => {
    await moderationApi.approve(uuid(401));
    expect((await moderationApi.queue()).map((i) => i.reportId)).not.toContain(uuid(401));
    expect((await moderationApi.report(uuid(401))).history[0]).toMatchObject({ action: 'approve', reason: null });
    expect(await code(moderationApi.approve(uuid(401)))).toBe('REPORT_NOT_PENDING_REVIEW');
  });

  it('revise: тело reasonText, причина в истории; пустая причина → BAD_REQUEST', async () => {
    expect(await code(moderationApi.revise(uuid(402), { reasonText: '' }))).toBe('BAD_REQUEST');
    await moderationApi.revise(uuid(402), { reasonText: 'Нужны фото салона' });
    const detail = await moderationApi.report(uuid(402));
    expect(detail.report.status).toBe('revision_required');
    expect(detail.history[0]).toMatchObject({ action: 'revise', reason: 'Нужны фото салона' });
  });

  it('delete: из любого статуса, статус не меняется, повтор → REPORT_ALREADY_DELETED, approve удалённого тоже', async () => {
    await moderationApi.delete(uuid(404), { reasonText: 'Ошибочно опубликован' });
    const detail = await moderationApi.report(uuid(404));
    expect(detail.report.status).toBe('published');
    expect(detail.history[0]?.action).toBe('delete');

    expect(await code(moderationApi.delete(uuid(404), { reasonText: 'ещё раз' }))).toBe('REPORT_ALREADY_DELETED');
    expect(await code(moderationApi.approve(uuid(405)))).toBe('REPORT_ALREADY_DELETED');
  });

  it('неизвестный отчёт → 404 REPORT_NOT_FOUND', async () => {
    expect(await code(moderationApi.approve(uuid(999)))).toBe('REPORT_NOT_FOUND');
  });
});

describe('inspectors', () => {
  it('list: без фильтра все, с фильтром только нужный статус, неизвестный статус → []', async () => {
    expect(await inspectorsApi.list()).toHaveLength(5);
    expect((await inspectorsApi.list('pending')).map((i) => i.status)).toEqual(['pending', 'pending']);
    expect(await inspectorsApi.list('whatever' as never)).toEqual([]);
  });

  it('verify: pending → verified и возвращает подборщика; повтор → INSPECTOR_NOT_PENDING', async () => {
    const res = await inspectorsApi.verify(uuid(101));
    expect(res).toMatchObject({ id: uuid(101), status: 'verified' });
    expect(await code(inspectorsApi.verify(uuid(101)))).toBe('INSPECTOR_NOT_PENDING');
  });

  it('ban: тело { reason } (не reasonText); pending и verified банятся, повтор → INSPECTOR_ALREADY_BANNED', async () => {
    expect(await code(inspectorsApi.ban(uuid(101), { reason: '' }))).toBe('BAD_REQUEST');
    expect(await inspectorsApi.ban(uuid(101), { reason: 'Фейковые отчёты' })).toMatchObject({ status: 'banned' });
    expect(await inspectorsApi.ban(uuid(103), { reason: 'Жалобы покупателей' })).toMatchObject({ status: 'banned' });
    expect(await code(inspectorsApi.ban(uuid(101), { reason: 'ещё раз' }))).toBe('INSPECTOR_ALREADY_BANNED');
  });

  it('ban с reasonText вместо reason отклоняется — защита от перепутанного поля', async () => {
    const wrongBody = { reasonText: 'не то поле' } as unknown as { reason: string };
    expect(await code(inspectorsApi.ban(uuid(101), wrongBody))).toBe('BAD_REQUEST');
  });

  it('неизвестный подборщик → 404 INSPECTOR_NOT_FOUND', async () => {
    expect(await code(inspectorsApi.verify(uuid(999)))).toBe('INSPECTOR_NOT_FOUND');
  });
});

describe('payouts', () => {
  it('list: идентификатор батча — uuid (не id), фильтр по статусу', async () => {
    const pending = await payoutsApi.list('pending');
    expect(pending).toHaveLength(2);
    expect(pending[0]).toHaveProperty('uuid');
    expect(pending[0]).not.toHaveProperty('id');
    expect((await payoutsApi.list('paid')).every((p) => p.paidAt !== null)).toBe(true);
    expect(await payoutsApi.list()).toHaveLength(4);
  });

  it('pay: pending → paid с paidAt; повтор и неизвестный uuid → одинаково PAYOUT_NOT_FOUND', async () => {
    await expect(payoutsApi.pay(uuid(301))).resolves.toBeUndefined();
    const paid = (await payoutsApi.list('paid')).find((p) => p.uuid === uuid(301));
    expect(paid?.paidAt).toBeTruthy();

    expect(await code(payoutsApi.pay(uuid(301)))).toBe('PAYOUT_NOT_FOUND');
    expect(await code(payoutsApi.pay(uuid(999)))).toBe('PAYOUT_NOT_FOUND');
  });

  it('суммы в копейках — целые числа', async () => {
    for (const batch of await payoutsApi.list()) expect(Number.isInteger(batch.amountByn)).toBe(true);
  });
});
