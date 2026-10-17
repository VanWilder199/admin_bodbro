import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MOBILE_QUERY } from '@/hooks/useMediaQuery';
import { accessState, buyerLabel, tabFromParam } from '@/features/purchases/purchase';
import { mail, uuid } from '@/mocks/fixtures/ids';
import { db, mockControl } from '@/mocks/state';
import { allScreensRoutes, enableFeatures } from '@/test/flags';
import { renderRoutes, storeSession } from '@/test/utils';

enableFeatures();

function setViewport(mobile: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === MOBILE_QUERY ? mobile : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => setViewport(false));

function renderPurchases(route = '/purchases') {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(allScreensRoutes, route) };
}

const location = () => screen.getByTestId('location').textContent;
const table = () => screen.findByRole('table');
const bodyRows = async () => within((await table()).querySelector('tbody')!).getAllByRole('row');
const buyers = async () => (await bodyRows()).map((r) => within(r).getAllByRole('cell')[0]!.textContent);
const tab = (name: string) => screen.getByRole('tab', { name });
const searchInput = () => screen.getByRole('searchbox', { name: 'Поиск по покупкам' });
const detail = () => screen.findByTestId('purchase-detail');

describe('список', () => {
  it('все покупки, свежие сверху; покупатель — email и телефон', async () => {
    renderPurchases();
    const names = await buyers();
    expect(names).toHaveLength(5);
    expect(names[0]).toContain(mail('buyer.three')); // 504 — самая свежая
    expect(names).toContain(`${mail('buyer.two')} · ${'+375291000112'}`);
  });

  it('вкладки пишут ?status=, «Все» — без параметра', async () => {
    const { user } = renderPurchases();
    await table();
    await user.click(tab('Оплачены'));
    await waitFor(() => expect(location()).toBe('/purchases?status=paid'));
    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
    await user.click(tab('Все'));
    await waitFor(() => expect(location()).toBe('/purchases'));
  });

  it('неизвестный статус в URL → «Все»', async () => {
    renderPurchases('/purchases?status=zzz');
    expect(await buyers()).toHaveLength(5);
    expect(tab('Все')).toHaveAttribute('aria-selected', 'true');
    expect(tabFromParam('zzz')).toBe('all');
  });

  it('сумма в копейках показана в BYN', async () => {
    renderPurchases();
    const row = (await bodyRows())[0]!;
    expect(row).toHaveTextContent(/1\s?900 BYN/);
  });

  it('статус ссылки: у неоплаченной «—», у отозванной «Отозвана»', async () => {
    renderPurchases();
    const rows = await bodyRows();
    const byBuyer = (needle: string) => rows.find((r) => r.textContent?.includes(needle))!;
    expect(within(byBuyer(mail('buyer.one'))).getAllByRole('cell')[4]).toHaveTextContent('Действует');
    expect(within(byBuyer('+375291000111')).getAllByRole('cell')[4]).toHaveTextContent('Отозвана');
    expect(within(byBuyer(mail('buyer.four'))).getAllByRole('cell')[4]).toHaveTextContent('—');
  });
});

describe('поиск', () => {
  it('покупка находится по email покупателя', async () => {
    const { user } = renderPurchases();
    await table();
    await user.type(searchInput(), 'buyer.one');
    expect(await screen.findByText(mail('buyer.one'))).toBeInTheDocument();
    await waitFor(async () => expect(await bodyRows()).toHaveLength(1));
    expect(location()).toContain('q=buyer.one');
  });

  it('и по телефону — в том виде, как он хранится', async () => {
    const { user } = renderPurchases();
    await table();
    await user.type(searchInput(), '+375291000112');
    await waitFor(async () => expect(await bodyRows()).toHaveLength(1));
  });

  it('ничего не найдено → пустое состояние со сбросом', async () => {
    const { user } = renderPurchases('/purchases?q=нет-такого');
    expect(await screen.findByText('Ничего не найдено по «нет-такого»')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сбросить поиск' }));
    expect(await buyers()).toHaveLength(5);
  });
});

describe('карточка покупки', () => {
  it('открывается по клику и адресуется через ?id=', async () => {
    const { user } = renderPurchases();
    await user.click(within((await bodyRows()).find((r) => r.textContent?.includes(mail('buyer.one')))!).getAllByRole('cell')[0]!);
    await waitFor(() => expect(location()).toBe(`/purchases?id=${uuid(501)}`));
    const panel = within(await detail());
    expect(panel.getByText(/4\s?100 BYN/)).toBeInTheDocument();
    expect(panel.getByText('chk_a1b2c3d4e5')).toBeInTheDocument();
    expect(panel.getByRole('link', { name: 'Skoda Octavia 2017' })).toHaveAttribute('href', `/reports/${uuid(404)}`);
  });

  it('по ссылке с ?id= карточка открыта сразу', async () => {
    renderPurchases(`/purchases?id=${uuid(501)}`);
    expect(await detail()).toBeInTheDocument();
  });

  it('показывает начисление подборщику', async () => {
    renderPurchases(`/purchases?id=${uuid(501)}`);
    const panel = within(await detail());
    expect(panel.getByText(/2\s?050 BYN/)).toBeInTheDocument();
    expect(panel.getByText('в батче выплат')).toBeInTheDocument();
  });

  it('у неоплаченной покупки нет ссылки, начисления и кнопки отзыва', async () => {
    renderPurchases(`/purchases?id=${uuid(503)}`);
    const panel = within(await detail());
    expect(panel.getByTestId('access-state')).toHaveTextContent('Нет ссылки');
    expect(panel.queryByRole('button', { name: /Отозвать/ })).not.toBeInTheDocument();
  });

  it('закрытие убирает ?id= из адреса', async () => {
    const { user } = renderPurchases(`/purchases?id=${uuid(501)}`);
    await detail();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(location()).toBe('/purchases'));
  });

  it('несуществующая покупка → блок ошибки с «Повторить»', async () => {
    renderPurchases(`/purchases?id=${uuid(999)}`);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Покупка не найдена');
  });
});

describe('отзыв ссылки', () => {
  const open = async () => {
    const utils = renderPurchases(`/purchases?id=${uuid(501)}`);
    await detail();
    return utils;
  };
  const reason = () => screen.getByLabelText('Причина') as HTMLTextAreaElement;
  const submit = () => within(screen.getByRole('dialog', { name: 'Отозвать ссылку на отчёт' })).getByRole('button', { name: 'Отозвать' });

  it('причина обязательна: с короткой причиной кнопка неактивна', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Отозвать ссылку/ }));
    expect(submit()).toBeDisabled();
    await user.type(reason(), 'коротко');
    expect(submit()).toBeDisabled();
  });

  it('отзыв: тело { reason }, в карточке «ссылка отозвана <дата>», повторный отзыв недоступен', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Отозвать ссылку/ }));
    await user.type(reason(), 'Покупатель запросил возврат');
    await user.click(submit());

    expect(await screen.findByText('Ссылка отозвана')).toBeInTheDocument(); // тост
    const panel = within(await detail());
    expect(await panel.findByText(/ссылка отозвана \d/)).toBeInTheDocument();
    expect(panel.getByTestId('access-state')).toHaveTextContent('Отозвана');
    expect(panel.queryByRole('button', { name: /Отозвать ссылку/ })).not.toBeInTheDocument();
    expect(db.purchases.find((p) => p.id === uuid(501))!.accessRevokedAt).not.toBeNull();
  });

  it('PURCHASE_NOT_PAID → тост, диалог закрыт, без красной ошибки', async () => {
    mockControl.failOnce('POST /admin/purchases/:id/revoke-access', { kind: 'app', status: 409, errorCode: 'PURCHASE_NOT_PAID' });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Отозвать ссылку/ }));
    await user.type(reason(), 'Покупатель запросил возврат');
    await user.click(submit());

    expect(await screen.findByText('Покупка не оплачена: ссылки на отчёт у неё нет')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Отозвать ссылку на отчёт' })).not.toBeInTheDocument());
  });

  it('PURCHASE_NOT_FOUND → тост «Покупка не найдена», диалог закрыт', async () => {
    mockControl.failOnce('POST /admin/purchases/:id/revoke-access', { kind: 'app', status: 404, errorCode: 'PURCHASE_NOT_FOUND' });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Отозвать ссылку/ }));
    await user.type(reason(), 'Покупатель запросил возврат');
    await user.click(submit());

    await waitFor(() => expect(screen.getAllByText('Покупка не найдена').length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Отозвать ссылку на отчёт' })).not.toBeInTheDocument());
  });

  it('500 → красная ошибка, диалог открыт, причина на месте', async () => {
    mockControl.failOnce('POST /admin/purchases/:id/revoke-access', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Отозвать ссылку/ }));
    await user.type(reason(), 'Покупатель запросил возврат');
    await user.click(submit());

    expect(await screen.findByText('Ошибка сервера. Попробуйте позже')).toBeInTheDocument();
    expect(reason().value).toBe('Покупатель запросил возврат');
  });

  it('двойной клик отправляет один запрос', async () => {
    let calls = 0;
    const { server } = await import('@/test/server');
    const { http, HttpResponse, delay } = await import('msw');
    server.use(
      http.post('/api/admin/purchases/:id/revoke-access', async () => {
        calls += 1;
        await delay(50);
        return HttpResponse.json({ accessRevokedAt: new Date().toISOString() });
      }),
    );
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Отозвать ссылку/ }));
    await user.type(reason(), 'Покупатель запросил возврат');
    const button = submit();
    await user.dblClick(button);
    await waitFor(() => expect(calls).toBe(1));
  });

  it('черновик причины переживает закрытие диалога', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: /Отозвать ссылку/ }));
    await user.type(reason(), 'Недописанная причина отзыва');
    await user.click(within(screen.getByRole('dialog', { name: 'Отозвать ссылку на отчёт' })).getByRole('button', { name: 'Отмена' }));
    expect(sessionStorage.getItem(`draft:revoke:${uuid(501)}`)).toBe('Недописанная причина отзыва');
    await user.click(screen.getByRole('button', { name: /Отозвать ссылку/ }));
    expect(reason().value).toBe('Недописанная причина отзыва');
  });
});

describe('сверка зависших платежей (ADM-16)', () => {
  const button = () => screen.findByRole('button', { name: /Сверить зависшие платежи с bePaid/ });

  it('подтверждение, затем итог в тосте; зависшие получают новый статус', async () => {
    const { user } = renderPurchases();
    await table();
    await user.click(await button());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Сверить' }));

    expect(await screen.findByText('Проверено: 2. Оплачено: 1, отклонено: 1')).toBeInTheDocument();
    expect(db.purchases.filter((p) => p.status === 'pending')).toHaveLength(0);
    await waitFor(async () => expect(await bodyRows()).toHaveLength(5));
  });

  it('когда зависших нет — «Зависших платежей нет»', async () => {
    db.purchases.forEach((p) => p.status === 'pending' && (p.status = 'failed'));
    const { user } = renderPurchases();
    await table();
    await user.click(await button());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Сверить' }));
    expect(await screen.findByText('Зависших платежей нет')).toBeInTheDocument();
  });

  it('отмена в диалоге ничего не отправляет', async () => {
    const { user } = renderPurchases();
    await table();
    await user.click(await button());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    expect(db.purchases.filter((p) => p.status === 'pending')).toHaveLength(2);
  });

  it('500 → красная ошибка, данные не меняются', async () => {
    mockControl.failOnce('POST /admin/purchases/reconcile', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderPurchases();
    await table();
    await user.click(await button());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Сверить' }));
    expect((await screen.findAllByText('Ошибка сервера. Попробуйте позже')).length).toBeGreaterThan(0);
    expect(db.purchases.filter((p) => p.status === 'pending')).toHaveLength(2);
  });
});

describe('вспомогательные функции', () => {
  it('accessState: неоплаченная — none, отозванная — revoked, просроченная — expired', () => {
    const now = Date.parse('2026-10-08T00:00:00Z');
    expect(accessState({ status: 'pending', accessRevokedAt: null, accessTokenExpiresAt: null }, now)).toBe('none');
    expect(accessState({ status: 'paid', accessRevokedAt: '2026-10-01T00:00:00Z', accessTokenExpiresAt: '2027-01-01T00:00:00Z' }, now)).toBe('revoked');
    expect(accessState({ status: 'paid', accessRevokedAt: null, accessTokenExpiresAt: '2026-09-01T00:00:00Z' }, now)).toBe('expired');
    expect(accessState({ status: 'paid', accessRevokedAt: null, accessTokenExpiresAt: '2027-01-01T00:00:00Z' }, now)).toBe('active');
  });

  it('buyerLabel: email, телефон, оба или «Неизвестен»', () => {
    expect(buyerLabel({ buyerEmail: 'a@b.c', buyerPhone: null })).toBe('a@b.c');
    expect(buyerLabel({ buyerEmail: null, buyerPhone: '+375291112233' })).toBe('+375291112233');
    expect(buyerLabel({ buyerEmail: null, buyerPhone: null })).toBe('Неизвестен');
  });
});
