import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { MOBILE_QUERY } from '@/hooks/useMediaQuery';
import { uuid } from '@/mocks/fixtures/ids';
import { db, mockControl } from '@/mocks/state';
import { appRoutes } from '@/routes';
import { server } from '@/test/server';
import { allScreensRoutes, enableFeatures } from '@/test/flags';
import { renderRoutes, storeSession } from '@/test/utils';
import { runBatchesMessage } from '@/features/payouts/useRunBatches';
import { reconcileMessage } from '@/features/purchases/useReconcile';

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

function renderPayouts(route = '/payouts', routes = allScreensRoutes) {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(routes, route) };
}

const table = () => screen.findByRole('table');
const bodyRows = async () => within((await table()).querySelector('tbody')!).getAllByRole('row');
const block = () => screen.findByTestId('unbatched-block');
const tab = (name: string) => screen.getByRole('tab', { name });
const runButton = () => within(screen.getByTestId('unbatched-block')).getByRole('button', { name: /Сформировать батчи сейчас/ });
const confirm = async (user: ReturnType<typeof userEvent.setup>) => user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Сформировать' }));

describe('накоплено вне батчей', () => {
  it('по подборщикам: имя, число начислений, сумма; итог по всем', async () => {
    renderPayouts();
    const panel = within(await block());
    expect(await panel.findByText('Олег Кравец')).toBeInTheDocument();
    expect(panel.getByText('Мария Лисицына')).toBeInTheDocument();
    expect(panel.getByText(/Всего \(3\):/)).toBeInTheDocument();
    expect(panel.getByText(/750 BYN/)).toBeInTheDocument();
  });

  it('нет накоплений → «Всё накопленное уже в батчах», кнопка неактивна', async () => {
    db.unbatched = [];
    renderPayouts();
    const panel = within(await block());
    expect(await panel.findByText('Всё накопленное уже в батчах.')).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
  });

  it('без флага batchTools блока нет и запрос не уходит', async () => {
    const requests: string[] = [];
    server.events.on('request:start', ({ request }) => requests.push(`${request.method} ${new URL(request.url).pathname}`));
    // обычные маршруты, флаг batchTools выключен: так приложение работает с настоящим бэкендом без BE-8
    const { features } = await import('@/features/flags');
    features.batchTools = false;
    renderPayouts('/payouts', appRoutes);
    await table();
    expect(screen.queryByTestId('unbatched-block')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Состав/ })).not.toBeInTheDocument();
    expect(requests).not.toContain('GET /api/admin/payouts/unbatched');
  });
});

describe('сформировать батчи сейчас', () => {
  it('подтверждение, затем итог в тосте; новые батчи в «К оплате», накопления пусты', async () => {
    const { user } = renderPayouts();
    await table();
    expect(await bodyRows()).toHaveLength(2);

    await user.click(runButton());
    await confirm(user);

    expect(await screen.findByText(/Создано батчей: 2 на/)).toBeInTheDocument();
    await waitFor(async () => expect(await bodyRows()).toHaveLength(4));
    expect(await within(await block()).findByText('Всё накопленное уже в батчах.')).toBeInTheDocument();
    expect(db.payouts.filter((p) => p.status === 'pending')).toHaveLength(4);
  });

  it('отмена в диалоге ничего не создаёт', async () => {
    const { user } = renderPayouts();
    await table();
    await user.click(runButton());
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Отмена' }));
    expect(db.payouts).toHaveLength(4);
    expect(db.unbatched).toHaveLength(2);
  });

  it('повторное нажатие во время выполнения заблокировано: один запрос', async () => {
    let calls = 0;
    server.use(
      http.post('/api/admin/payouts/run-batches', async () => {
        calls += 1;
        await delay(80);
        return HttpResponse.json({ batchesCreated: 2, totalAmountByn: 75_000 });
      }),
    );
    const { user } = renderPayouts();
    await table();
    await user.click(runButton());
    const dialog = await screen.findByRole('dialog');
    const go = within(dialog).getByRole('button', { name: 'Сформировать' });
    await user.dblClick(go);
    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls).toBe(1);
  });

  it('500 → красная ошибка, накопления на месте', async () => {
    mockControl.failOnce('POST /admin/payouts/run-batches', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderPayouts();
    await table();
    await user.click(runButton());
    await confirm(user);
    expect((await screen.findAllByText('Ошибка сервера. Попробуйте позже')).length).toBeGreaterThan(0);
    expect(db.unbatched).toHaveLength(2);
  });

  it('сообщения: ничего не создано / создано', () => {
    expect(runBatchesMessage({ batchesCreated: 0, totalAmountByn: 0 })).toBe('Нечего формировать: накоплений нет');
    expect(runBatchesMessage({ batchesCreated: 3, totalAmountByn: 72_000 })).toMatch(/Создано батчей: 3 на 720\sBYN/);
    expect(reconcileMessage({ checked: 0, markedPaid: 0, markedFailed: 0 })).toBe('Зависших платежей нет');
  });
});

describe('состав батча', () => {
  it('раскрытие строки показывает покупки, сумма позиций совпадает с суммой батча', async () => {
    const { user } = renderPayouts();
    await table();
    const row = (await bodyRows())[0]!; // 301: 125 000 = 50 000 + 45 000 + 30 000
    await user.click(within(row).getByRole('button', { name: /Показать состав/ }));

    const items = within(await screen.findByTestId('batch-items'));
    expect(await items.findAllByRole('listitem')).toHaveLength(3);
    const sum = await items.findByTestId('batch-items-sum');
    expect(sum).toHaveTextContent(/Сумма позиций: 1\s?250 BYN/);
    expect(sum).not.toHaveTextContent('не совпадает');
  });

  it('несовпадение суммы позиций с суммой батча подсвечивается', async () => {
    db.batchItems[uuid(301)] = [{ purchaseId: uuid(511), reportId: uuid(404), amountByn: 1_000, createdAt: '2026-09-05T10:00:00Z' }];
    const { user } = renderPayouts();
    await table();
    await user.click(within((await bodyRows())[0]!).getByRole('button', { name: /Показать состав/ }));
    expect(await screen.findByText(/не совпадает с суммой батча/)).toBeInTheDocument();
  });

  it('раскрыт один батч за раз; повторный клик скрывает', async () => {
    const { user } = renderPayouts();
    await table();
    const rows = await bodyRows();
    await user.click(within(rows[0]!).getByRole('button', { name: /Показать состав/ }));
    await screen.findByTestId('batch-items');
    await user.click(within((await bodyRows())[2]!).getByRole('button', { name: /Показать состав/ }));
    await waitFor(() => expect(screen.getAllByTestId('batch-items')).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /Скрыть состав/ }));
    await waitFor(() => expect(screen.queryByTestId('batch-items')).not.toBeInTheDocument());
  });

  it('позиция ведёт в карточку отчёта', async () => {
    const { user } = renderPayouts();
    await table();
    await user.click(within((await bodyRows())[0]!).getByRole('button', { name: /Показать состав/ }));
    const link = (await within(await screen.findByTestId('batch-items')).findAllByRole('link'))[0]!;
    expect(link.getAttribute('href')).toMatch(/^\/reports\//);
  });

  it('батч без позиций → «В батче нет позиций»', async () => {
    db.batchItems[uuid(301)] = [];
    const { user } = renderPayouts();
    await table();
    await user.click(within((await bodyRows())[0]!).getByRole('button', { name: /Показать состав/ }));
    expect(await screen.findByText('В батче нет позиций.')).toBeInTheDocument();
  });

  it('ошибка загрузки состава → «Повторить»', async () => {
    mockControl.failOnce('GET /admin/payouts/:id', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderPayouts();
    await table();
    await user.click(within((await bodyRows())[0]!).getByRole('button', { name: /Показать состав/ }));
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByTestId('batch-items')).toBeInTheDocument();
  });

  it('вкладка «Оплачено»: у оплаченного батча состав тоже виден', async () => {
    const { user } = renderPayouts();
    await table();
    await user.click(tab('Оплачено'));
    await waitFor(async () => expect(await bodyRows()).toHaveLength(2));
    await user.click(within((await bodyRows())[0]!).getByRole('button', { name: /Показать состав/ }));
    expect(await within(await screen.findByTestId('batch-items')).findAllByRole('listitem')).toHaveLength(2);
  });

  it('телефон: состав раскрывается и в списке', async () => {
    setViewport(true);
    const { user } = renderPayouts();
    const buttons = await screen.findAllByRole('button', { name: /Показать состав/ });
    await user.click(buttons[0]!);
    expect(await screen.findByTestId('batch-items')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
