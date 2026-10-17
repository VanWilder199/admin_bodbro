import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import type { PayoutBatch } from '@/api/types';
import { MOBILE_QUERY } from '@/hooks/useMediaQuery';
import { uuid } from '@/mocks/fixtures/ids';
import { db, mockControl } from '@/mocks/state';
import { appRoutes } from '@/routes';
import { server } from '@/test/server';
import { recordRequests, renderRoutes, storeSession } from '@/test/utils';
import { tabFromParam } from './PayoutsPage';

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

function renderPage(route = '/payouts') {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(appRoutes, route) };
}

const location = () => screen.getByTestId('location').textContent;
const table = () => screen.findByRole('table');
const bodyRows = async () => within((await table()).querySelector('tbody')!).getAllByRole('row');
const inspectorNames = async () => (await bodyRows()).map((r) => within(r).getAllByRole('cell')[0]!.querySelector('p')!.textContent);
const tab = (name: string) => screen.getByRole('tab', { name });
const total = () => screen.getByTestId('payouts-total');
const rowOf = async (name: string, period = 'сентябрь 2026') => (await bodyRows()).find((r) => r.textContent?.includes(name) && r.textContent.toLowerCase().includes(period))!;

const PAID_TOTAL = /3\s?025 BYN/;

describe('вкладки', () => {
  it('по умолчанию «К оплате»: только pending, свежие сверху (порядок бэкенда)', async () => {
    renderPage();
    expect(await inspectorNames()).toEqual(['Олег Кравец', 'Мария Лисицына']);
    expect(tab('К оплате')).toHaveAttribute('aria-selected', 'true');
  });

  it('«Оплачено» и «Все» пишут ?status=; «Все» уходит на бэкенд без параметра', async () => {
    const { user } = renderPage();
    await table();

    await user.click(tab('Оплачено'));
    await waitFor(() => expect(location()).toBe('/payouts?status=paid'));
    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
    for (const row of await bodyRows()) expect(row).toHaveTextContent('август 2026');

    await user.click(tab('Все'));
    await waitFor(() => expect(location()).toBe('/payouts?status=all'));
    await waitFor(async () => expect(await bodyRows()).toHaveLength(4));
  });

  it('вкладка берётся из адреса; незнакомое значение — «К оплате»', async () => {
    renderPage('/payouts?status=paid');
    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
    expect(tab('Оплачено')).toHaveAttribute('aria-selected', 'true');
    expect(tabFromParam('x')).toBe('pending');
    expect(tabFromParam(null)).toBe('pending');
    expect(tabFromParam('all')).toBe('all');
  });
});

describe('таблица и суммы', () => {
  it('в строке: имя и email подборщика, период словами, сумма в BYN из копеек', async () => {
    renderPage();
    const cells = within(await rowOf('Олег Кравец')).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Олег Кравец');
    expect(within(cells[0]!).getByRole('link')).toHaveAttribute('href', 'mailto:oleg.kravets@example.com');
    expect(cells[1]).toHaveTextContent(/сентябрь 2026/i);
    expect(cells[2]).toHaveTextContent(/1\s?250 BYN/); // 125 000 копеек
    expect(cells[2]).not.toHaveTextContent('125000');
  });

  it('копейки показываются, только если они есть: 48 750 → 487,50 BYN', async () => {
    renderPage();
    expect(within(await rowOf('Мария Лисицына')).getAllByRole('cell')[2]).toHaveTextContent(/487,50 BYN/);
  });

  it('итог по вкладке равен сумме строк', async () => {
    renderPage();
    await table();
    expect(total()).toHaveTextContent('Итого (2):');
    expect(total()).toHaveTextContent(/1\s?737,50 BYN/); // 125 000 + 48 750 = 173 750 копеек

    const amounts = (await bodyRows()).map((r) => within(r).getAllByRole('cell')[2]!.textContent ?? '');
    // сумма строк в копейках: из текста «1 250 BYN» / «487,50 BYN» обратно в копейки
    const kopecks = amounts.map((text) => Math.round(Number.parseFloat(text.replace(/[^\d,]/g, '').replace(',', '.')) * 100));
    expect(kopecks).toEqual([125_000, 48_750]);
    expect(kopecks.reduce((a, b) => a + b, 0)).toBe(173_750); // ровно то, что показано в итоге
  });

  it('итог на вкладке «Оплачено» и «Все»', async () => {
    const { user } = renderPage();
    await table();
    await user.click(tab('Оплачено'));
    await waitFor(() => expect(total()).toHaveTextContent(PAID_TOTAL));
    await user.click(tab('Все'));
    await waitFor(() => expect(total()).toHaveTextContent(/4\s?762,50 BYN/)); // 173 750 + 302 500 = 476 250 копеек
  });

  it('итог по фильтру поиска считается по найденным строкам, не по всему списку', async () => {
    renderPage('/payouts?status=all&q=Кравец');
    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
    expect(total()).toHaveTextContent('Итого по фильтру (2):');
    expect(total()).toHaveTextContent(/3\s?350 BYN/); // 125 000 + 210 000
  });

  it('итог не зависит от страницы: считается по всем строкам, а не по видимым 25', async () => {
    const many: PayoutBatch[] = Array.from({ length: 30 }, (_, i) => ({
      uuid: uuid(7000 + i),
      inspectorId: uuid(103),
      inspectorName: `Подборщик ${String(i).padStart(2, '0')}`,
      inspectorEmail: `p${i}@example.com`,
      periodStart: '2026-09-01T00:00:00Z',
      periodEnd: '2026-09-30T23:59:59Z',
      amountByn: 100,
      status: 'pending',
      createdAt: '2026-10-01T03:00:00Z',
      paidAt: null,
    }));
    server.use(http.get('/api/admin/payouts', () => HttpResponse.json(many)));
    renderPage();
    expect(await bodyRows()).toHaveLength(25);
    expect(total()).toHaveTextContent('Итого (30):');
    expect(total()).toHaveTextContent(/30 BYN/); // 30 × 1 BYN, а не 25
  });

  it('у оплаченного видна дата оплаты, у неоплаченного — прочерк', async () => {
    renderPage('/payouts?status=all');
    const paid = within(await rowOf('Олег Кравец', 'август 2026')).getAllByRole('cell');
    expect(paid[4]).toHaveTextContent(/3 сент\.? 2026/);
    const pending = within(await rowOf('Олег Кравец', 'сентябрь 2026')).getAllByRole('cell');
    expect(pending[4]).toHaveTextContent('—');
  });

  it('сортировка по сумме на клиенте', async () => {
    const { user } = renderPage();
    await table();
    const header = screen.getByRole('columnheader', { name: /Сумма/ });
    await user.click(within(header).getByRole('button'));
    expect(await inspectorNames()).toEqual(['Мария Лисицына', 'Олег Кравец']);
    await user.click(within(header).getByRole('button'));
    expect(await inspectorNames()).toEqual(['Олег Кравец', 'Мария Лисицына']);
  });

  it('поиск по имени, email и месяцу без запроса к бэкенду', async () => {
    const { user } = renderPage('/payouts?status=all');
    await table();
    const requests = recordRequests(server);
    const search = () => screen.getByRole('searchbox', { name: 'Поиск по выплатам' });

    await user.type(search(), 'лисицына');
    await waitFor(async () => expect(await inspectorNames()).toEqual(['Мария Лисицына', 'Мария Лисицына']));
    await user.clear(search());
    await user.type(search(), 'август');
    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
    await user.clear(search());
    await user.type(search(), 'oleg.kravets');
    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
    expect(requests.filter((r) => r === 'GET /api/admin/payouts')).toEqual([]);
  });
});

describe('кнопка оплаты', () => {
  it('есть только у pending', async () => {
    renderPage('/payouts?status=all');
    const rows = await bodyRows();
    const withButton = rows.filter((r) => within(r).queryByRole('button', { name: /Отметить оплаченным/ }));
    expect(withButton).toHaveLength(2);
    for (const row of rows.filter((r) => !withButton.includes(r))) expect(row).toHaveTextContent('Оплачен');
  });
});

describe('оплата', () => {
  async function openPay(name = 'Олег Кравец') {
    const ctx = renderPage();
    await ctx.user.click(within(await rowOf(name)).getByRole('button', { name: /Отметить оплаченным/ }));
    await screen.findByRole('dialog');
    return ctx;
  }
  const confirm = () => within(screen.getByRole('dialog')).getByRole('button', { name: 'Отметить оплаченным' });

  it('диалог показывает ФИО, период и сумму и предупреждает о необратимости', async () => {
    await openPay();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/Олег Кравец · сентябрь 2026 · 1\s?250 BYN/)).toBeInTheDocument();
    expect(dialog.getByText(/Действие необратимо/)).toBeInTheDocument();
  });

  it('в URL запроса подставляется batch.uuid', async () => {
    const requests = recordRequests(server);
    const { user } = await openPay();
    await user.click(confirm());
    await waitFor(() => expect(requests).toContain(`POST /api/admin/payouts/${uuid(301)}/pay`));
  });

  it('после 200 батч уходит из «К оплате», тост с суммой, итог и счётчик в меню уменьшаются', async () => {
    const { user, queryClient } = await openPay();
    await user.click(confirm());

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // тост рисует Sonner, и для скринридеров он дублируется в aria-live-области: ищем «хотя бы один»
    expect((await screen.findAllByText(/Оплата отмечена: Олег Кравец, 1\s?250 BYN/)).length).toBeGreaterThan(0);
    expect(await inspectorNames()).toEqual(['Мария Лисицына']);
    expect(total()).toHaveTextContent(/487,50 BYN/);
    expect(queryClient.getQueryData<PayoutBatch[]>(queryKeys.payouts('pending'))?.map((b) => b.uuid)).toEqual([uuid(302)]);
    await waitFor(() => expect(screen.getByRole('navigation', { name: 'Основное меню' }).querySelector('a[href="/payouts"] [data-testid="nav-count"]')).toHaveTextContent('1'));
  });

  it('и появляется в «Оплачено» с датой оплаты', async () => {
    const { user } = await openPay();
    await user.click(confirm());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(tab('Оплачено'));
    await waitFor(async () => expect(await bodyRows()).toHaveLength(3));
    const row = within(await rowOf('Олег Кравец', 'сентябрь 2026')).getAllByRole('cell');
    expect(row[4]).not.toHaveTextContent('—');
    expect(db.payouts.find((p) => p.uuid === uuid(301))?.paidAt).toBeTruthy();
  });

  it('«Отмена» — без запроса', async () => {
    const requests = recordRequests(server);
    const { user } = await openPay();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests.filter((r) => r.startsWith('POST'))).toEqual([]);
  });

  it('двойной клик — один запрос', async () => {
    server.use(
      http.post(`/api/admin/payouts/${uuid(301)}/pay`, async () => {
        await delay(100);
        const batch = db.payouts.find((p) => p.uuid === uuid(301))!;
        batch.status = 'paid';
        batch.paidAt = new Date().toISOString();
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const requests = recordRequests(server);
    const { user } = await openPay();
    await user.dblClick(confirm());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests.filter((r) => r === `POST /api/admin/payouts/${uuid(301)}/pay`)).toHaveLength(1);
  });

  it('404 PAYOUT_NOT_FOUND (уже оплачен в другой вкладке) → тост «Батч уже оплачен или не найден», диалог закрыт, список обновлён', async () => {
    const { user } = await openPay();
    const batch = db.payouts.find((p) => p.uuid === uuid(301))!;
    batch.status = 'paid'; // коллега оплатил раньше
    batch.paidAt = new Date().toISOString();

    await user.click(confirm());
    expect(await screen.findByText('Батч уже оплачен или не найден')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(async () => expect(await inspectorNames()).toEqual(['Мария Лисицына']));
  });

  it('сеть упала → тост-ошибка, диалог остаётся, повтор проходит', async () => {
    mockControl.failOnce('POST /admin/payouts/:id/pay', { kind: 'network' });
    const { user } = await openPay();
    await user.click(confirm());

    expect(await screen.findByText('Нет связи с сервером. Попробуйте ещё раз')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(confirm());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(db.payouts.find((p) => p.uuid === uuid(301))?.status).toBe('paid');
  });

  it('500 → красный тост, диалог остаётся', async () => {
    mockControl.failOnce('POST /admin/payouts/:id/pay', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = await openPay();
    await user.click(confirm());
    expect(await screen.findByText('Ошибка сервера. Попробуйте позже')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('пустые состояния и ошибки', () => {
  it('«К оплате» пусто → подсказка про 1-е число', async () => {
    server.use(http.get('/api/admin/payouts', () => HttpResponse.json([])));
    renderPage();
    expect(await screen.findByText('Нет батчей к оплате')).toBeInTheDocument();
    expect(screen.getByText('Батчи создаются автоматически 1-го числа каждого месяца.')).toBeInTheDocument();
    expect(screen.queryByTestId('payouts-total')).not.toBeInTheDocument();
  });

  it('«Оплачено» пусто → сообщение без подсказки про 1-е число', async () => {
    server.use(http.get('/api/admin/payouts', () => HttpResponse.json([])));
    renderPage('/payouts?status=paid');
    expect(await screen.findByText('Оплаченных батчей пока нет')).toBeInTheDocument();
    expect(screen.queryByText(/1-го числа/)).not.toBeInTheDocument();
  });

  it('ничего не найдено по поиску → «Сбросить поиск»', async () => {
    const { user } = renderPage('/payouts?q=qqq');
    expect(await screen.findByText('Ничего не найдено по «qqq»')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Сбросить поиск' }));
    expect(await table()).toBeInTheDocument();
  });

  it('ошибка загрузки → «Повторить»', async () => {
    mockControl.failOnce('GET /admin/payouts', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ошибка сервера. Попробуйте позже');
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }));
    expect(await table()).toBeInTheDocument();
  });

  it('скелетон, пока грузится', async () => {
    server.use(
      http.get('/api/admin/payouts', async () => {
        await delay(150);
        return HttpResponse.json([]);
      }),
    );
    renderPage();
    expect(await screen.findByLabelText('Загрузка выплат')).toBeInTheDocument();
  });
});

describe('телефон (< 768px)', () => {
  beforeEach(() => setViewport(true));

  it('вместо таблицы — карточки с суммой, статусом и кнопкой', async () => {
    renderPage();
    expect(await screen.findByText('Олег Кравец')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Отметить оплаченным/ })).toHaveLength(2);
    expect(screen.getByText(/сентябрь 2026 · oleg\.kravets@example\.com/)).toBeInTheDocument();
  });

  it('оплата работает и в списке', async () => {
    const { user } = renderPage();
    const [first] = await screen.findAllByRole('button', { name: /Отметить оплаченным/ });
    await user.click(first!);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отметить оплаченным' }));
    await waitFor(() => expect(db.payouts.find((p) => p.uuid === uuid(301))?.status).toBe('paid'));
  });

  it('у оплаченного кнопки нет', async () => {
    renderPage('/payouts?status=paid');
    expect(await screen.findAllByText('Оплачен')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Отметить оплаченным/ })).not.toBeInTheDocument();
  });
});
