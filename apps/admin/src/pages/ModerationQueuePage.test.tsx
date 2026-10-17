import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import type { ModerationQueueItem } from '@/api/types';
import { MOBILE_QUERY } from '@/hooks/useMediaQuery';
import { uuid } from '@/mocks/fixtures/ids';
import { mockControl } from '@/mocks/state';
import { appRoutes } from '@/routes';
import { server } from '@/test/server';
import { recordRequests, renderRoutes, storeSession } from '@/test/utils';
import { QUEUE_REFRESH_MS } from './ModerationQueuePage';

/** happy-dom не считает media-запросы по ширине окна: подменяем matchMedia и сами решаем, телефон это или десктоп. */
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

function renderQueue(route = '/moderation') {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(appRoutes, route) };
}

/** Подменить ответ очереди целиком. */
function serveQueue(items: ModerationQueueItem[]) {
  server.use(http.get('/api/admin/reports/queue', () => HttpResponse.json(items)));
}

function queueItem(n: number, overrides: Partial<ModerationQueueItem> = {}): ModerationQueueItem {
  return {
    reportId: uuid(5000 + n),
    carId: uuid(6000 + n),
    vin: `VIN${String(n).padStart(14, '0')}`,
    make: 'Make',
    model: `Model${n}`,
    year: 2010 + (n % 10),
    inspectorId: uuid(103),
    inspectorName: 'Олег Кравец',
    inspectorStatus: 'verified',
    priceByn: 300_000,
    resubmitted: false,
    versionNo: 1,
    submittedAt: new Date(Date.UTC(2026, 8, 1, 0, n)).toISOString(),
    ...overrides,
  };
}

const location = () => screen.getByTestId('location').textContent;
/** Ссылки на карточки отчётов (меню в счёт не идёт). Сплэш проверки токена тоже рисует main, поэтому по main искать нельзя. */
const reportLinks = () => screen.queryAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/reports/'));
const table = () => screen.findByRole('table');
const bodyRows = async () => within((await table()).querySelector('tbody')!).getAllByRole('row');
/** Названия машин: текст ссылки, без бейджа «Повторно» в той же ячейке. */
const firstColumn = async () => (await bodyRows()).map((r) => within(within(r).getAllByRole('cell')[0]!).getByRole('link').textContent);
const searchInput = () => screen.getByRole('searchbox', { name: 'Поиск по очереди' }) as HTMLInputElement;
const queueRequests = (requests: string[]) => requests.filter((r) => r === 'GET /api/admin/reports/queue');

describe('данные очереди', () => {
  it('порядок как у бэкенда — старые сверху', async () => {
    renderQueue();
    expect(await firstColumn()).toEqual(['Volkswagen Passat 2017', 'BMW 520d 2011', 'Skoda']);
  });

  it('у машины без модели и года показывается то, что есть; пустой VIN — прочерк', async () => {
    renderQueue();
    const cells = within((await bodyRows())[2]!).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('Skoda');
    expect(cells[1]).toHaveTextContent('—');
  });

  it('нет ни марки, ни модели, ни года → «Без названия»', async () => {
    serveQueue([queueItem(1, { make: null, model: null, year: null, vin: null })]);
    renderQueue();
    expect(await firstColumn()).toEqual(['Без названия']);
  });

  it('подборщик — имя из ответа, у верифицированного без предупреждения', async () => {
    renderQueue();
    const cell = within((await bodyRows())[0]!).getAllByRole('cell')[2]!;
    expect(cell).toHaveTextContent('Олег Кравец');
    expect(cell).not.toHaveTextContent(/не верифицирован|заблокирован/);
  });

  it('цена в копейках показана в рублях', async () => {
    renderQueue();
    const cell = within((await bodyRows())[0]!).getAllByRole('cell')[3]!;
    expect(cell).toHaveTextContent(/5\s?000 BYN/);
  });

  it('«В очереди с» — относительное время по настоящей дате отправки, а не создания', async () => {
    renderQueue();
    const time = within((await bodyRows())[0]!).getByRole('time');
    expect(time.textContent).toMatch(/назад/);
    expect(time.getAttribute('title')).not.toContain('дата создания');
    expect(time).toHaveAttribute('datetime', '2026-09-27T08:12:44.512Z');
  });

  it('порядок по дате отправки: повторно отправленный отчёт встаёт после более нового, а не на старое место', async () => {
    renderQueue();
    // 402 создан 15 сентября (раньше всех), но отправлен повторно 27-го в 10:40 — после 401 (08:12), но до 403 (28-го)
    expect(await firstColumn()).toEqual(['Volkswagen Passat 2017', 'BMW 520d 2011', 'Skoda']);
  });

  it('повторно отправленный отчёт помечен «Повторно»', async () => {
    renderQueue();
    const rows = await bodyRows();
    expect(within(rows[1]!).getByText('Повторно')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('Повторно')).not.toBeInTheDocument();
  });

  it('неверифицированный подборщик — предупреждение прямо в очереди', async () => {
    serveQueue([queueItem(1, { inspectorStatus: 'pending' }), queueItem(2, { inspectorStatus: 'banned' }), queueItem(3)]);
    renderQueue();
    const rows = await bodyRows();
    expect(within(rows[0]!).getByText('не верифицирован')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('заблокирован')).toBeInTheDocument();
    expect(within(rows[2]!).queryByText(/не верифицирован|заблокирован/)).not.toBeInTheDocument();
  });

  it('поиск находит и по имени подборщика', async () => {
    const { user } = renderQueue();
    await table();
    await user.type(searchInput(), 'лисицын');
    await waitFor(() => expect(location()).toContain('q=%D0%BB%D0%B8%D1%81%D0%B8%D1%86%D1%8B%D0%BD'));
    expect(await firstColumn()).toEqual(['BMW 520d 2011']);
  });

  it('пока грузится — скелетон, потом таблица', async () => {
    renderQueue();
    // сначала сплэш проверки токена (GET /admin/), затем скелетон самой очереди
    expect(await screen.findByLabelText('Загрузка очереди')).toBeInTheDocument();
    await table();
    expect(screen.queryByLabelText('Загрузка очереди')).not.toBeInTheDocument();
  });

  it('очередь перечитывается раз в минуту', async () => {
    const { queryClient } = renderQueue();
    await table();
    const observers = queryClient.getQueryCache().find({ queryKey: queryKeys.moderationQueue })!.observers;
    expect(observers.some((o) => o.options.refetchInterval === QUEUE_REFRESH_MS)).toBe(true);
    expect(QUEUE_REFRESH_MS).toBe(60_000);
  });
});

describe('поиск', () => {
  it('фильтрует по марке, модели и VIN без запроса к бэкенду; значение — в ?q=', async () => {
    const { user } = renderQueue();
    await table();
    const requests = recordRequests(server);

    await user.type(searchInput(), 'passat');
    await waitFor(() => expect(location()).toBe('/moderation?q=passat'));
    expect(await firstColumn()).toEqual(['Volkswagen Passat 2017']);

    await user.clear(searchInput());
    await user.type(searchInput(), 'WBAFR9');
    await waitFor(() => expect(location()).toBe('/moderation?q=WBAFR9'));
    expect(await firstColumn()).toEqual(['BMW 520d 2011']);

    await user.clear(searchInput());
    await user.type(searchInput(), 'skoda');
    await waitFor(() => expect(location()).toBe('/moderation?q=skoda'));
    expect(await firstColumn()).toEqual(['Skoda']);

    expect(queueRequests(requests)).toEqual([]);
  });

  it('ничего не найдено → сообщение и кнопка «Сбросить поиск»', async () => {
    const { user } = renderQueue('/moderation?q=qqq');
    expect(await screen.findByText('Ничего не найдено по «qqq»')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Сбросить поиск' }));
    expect(await table()).toBeInTheDocument();
    expect(location()).toBe('/moderation');
    expect(searchInput().value).toBe('');
  });

  it('поиск из ссылки подставляется в поле и применяется', async () => {
    renderQueue('/moderation?q=bmw');
    expect(await firstColumn()).toEqual(['BMW 520d 2011']);
    expect(searchInput().value).toBe('bmw');
  });
});

describe('сортировка по колонкам', () => {
  it('клик по заголовку сортирует на клиенте: возрастание → убывание → порядок бэкенда', async () => {
    const { user } = renderQueue();
    await table();
    const requests = recordRequests(server);
    const header = () => screen.getByRole('columnheader', { name: /Машина/ });

    await user.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'ascending');
    expect(await firstColumn()).toEqual(['BMW 520d 2011', 'Skoda', 'Volkswagen Passat 2017']);

    await user.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'descending');
    expect(await firstColumn()).toEqual(['Volkswagen Passat 2017', 'Skoda', 'BMW 520d 2011']);

    await user.click(within(header()).getByRole('button'));
    expect(header()).toHaveAttribute('aria-sort', 'none');
    expect(await firstColumn()).toEqual(['Volkswagen Passat 2017', 'BMW 520d 2011', 'Skoda']);
    expect(queueRequests(requests)).toEqual([]);
  });

  it('VIN: пустые значения всегда в конце', async () => {
    const { user } = renderQueue();
    await table();
    const header = screen.getByRole('columnheader', { name: /VIN/ });
    await user.click(within(header).getByRole('button'));
    await user.click(within(header).getByRole('button')); // по убыванию
    expect(await firstColumn()).toEqual(['Volkswagen Passat 2017', 'BMW 520d 2011', 'Skoda']);
  });
});

describe('переход в карточку', () => {
  it('клик по строке → /reports/:id', async () => {
    const { user } = renderQueue();
    const [row] = await bodyRows();
    await user.click(within(row!).getAllByRole('cell')[1]!); // по ячейке VIN, не по ссылке
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(401)}`));
  });

  it('клик по названию машины (ссылка) тоже ведёт в карточку, один раз', async () => {
    const { user, router } = renderQueue();
    await table();
    const before = router.state.historyAction;
    await user.click(screen.getByRole('link', { name: 'BMW 520d 2011' }));
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(402)}`));
    expect(before).toBe('POP');
    // одна запись в истории: после перехода «Назад» ведёт в очередь, а не на этот же отчёт
    await act(async () => {
      await router.navigate(-1);
    });
    expect(location()).toBe('/moderation');
  });

  it('Enter на строке открывает карточку', async () => {
    const { user } = renderQueue();
    const [row] = await bodyRows();
    row!.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(401)}`));
  });

  it('«Назад» из карточки восстанавливает поиск', async () => {
    const { user, router } = renderQueue('/moderation?q=skoda');
    await user.click(await screen.findByRole('link', { name: 'Skoda' }));
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(403)}`));

    await act(async () => {
      await router.navigate(-1);
    });
    expect(location()).toBe('/moderation?q=skoda');
    expect(await firstColumn()).toEqual(['Skoda']);
    expect(searchInput().value).toBe('skoda');
  });

  it('«Назад» из карточки восстанавливает страницу и сортировку', async () => {
    serveQueue(Array.from({ length: 30 }, (_, i) => queueItem(i + 1)));
    const { user, router } = renderQueue('/moderation?page=2&sort=vin&dir=desc');
    const rows = await bodyRows();
    expect(rows).toHaveLength(5); // 30 строк по 25: на второй странице остаётся 5

    await user.click(within(rows[0]!).getByRole('link'));
    await waitFor(() => expect(location()).toMatch(/^\/reports\//));
    await act(async () => {
      await router.navigate(-1);
    });
    expect(location()).toBe('/moderation?page=2&sort=vin&dir=desc');
    expect(await bodyRows()).toHaveLength(5);
  });
});

describe('пагинация', () => {
  it('по 25 строк, страница в ?page=', async () => {
    serveQueue(Array.from({ length: 30 }, (_, i) => queueItem(i + 1)));
    const { user } = renderQueue();
    expect(await bodyRows()).toHaveLength(25);
    expect(screen.getByText('Страница 1 из 2 · всего 30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Назад/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Вперёд/ }));
    await waitFor(() => expect(location()).toBe('/moderation?page=2'));
    expect(await bodyRows()).toHaveLength(5);
    expect(screen.getByRole('button', { name: /Вперёд/ })).toBeDisabled();
  });

  it('на одной странице блока пагинации нет', async () => {
    renderQueue();
    await table();
    expect(screen.queryByRole('navigation', { name: 'Страницы' })).not.toBeInTheDocument();
  });

  it('устаревшая ссылка на несуществующую страницу показывает последнюю, а не пустоту', async () => {
    serveQueue(Array.from({ length: 30 }, (_, i) => queueItem(i + 1)));
    renderQueue('/moderation?page=99');
    expect(await bodyRows()).toHaveLength(5);
  });
});

describe('пустое состояние и ошибки', () => {
  it('пустая очередь → «Очередь пуста — все отчёты разобраны»', async () => {
    serveQueue([]);
    renderQueue();
    expect(await screen.findByText('Очередь пуста — все отчёты разобраны')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('ошибка загрузки → сообщение и «Повторить»; повтор показывает таблицу', async () => {
    mockControl.failOnce('GET /admin/reports/queue', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderQueue();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ошибка сервера. Попробуйте позже');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Повторить' }));
    expect(await table()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('сеть недоступна → понятное сообщение', async () => {
    mockControl.failOnce('GET /admin/reports/queue', { kind: 'network' });
    renderQueue();
    expect(await screen.findByText('Нет связи с сервером. Проверьте интернет и повторите.')).toBeInTheDocument();
  });

  it('ошибка фонового обновления не прячет уже загруженный список', async () => {
    const { queryClient } = renderQueue();
    await table();

    mockControl.fail('GET /admin/reports/queue', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.moderationQueue });
    });

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('телефон (< 768px)', () => {
  beforeEach(() => setViewport(true));

  it('вместо таблицы — список ячеек, каждая — ссылка на карточку', async () => {
    renderQueue();
    await waitFor(() => expect(reportLinks()).toHaveLength(3));
    expect(reportLinks()[0]).toHaveAttribute('href', `/reports/${uuid(401)}`);
    expect(reportLinks()[0]).toHaveTextContent('Volkswagen Passat 2017');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('в подзаголовке ячейки — VIN и подборщик; без VIN — «VIN не указан»', async () => {
    renderQueue();
    await waitFor(() => expect(reportLinks()).toHaveLength(3));
    expect(reportLinks()[0]).toHaveTextContent(/WVWZZZ3CZHE123456 · Олег Кравец · 5\s?000 BYN/);
    expect(reportLinks()[2]).toHaveTextContent('VIN не указан');
  });

  it('поиск работает и в списке', async () => {
    const { user } = renderQueue();
    await waitFor(() => expect(reportLinks()).toHaveLength(3));
    await user.type(searchInput(), 'bmw');
    await waitFor(() => expect(reportLinks()).toHaveLength(1));
    expect(reportLinks()[0]).toHaveTextContent('BMW 520d 2011');
  });

  it('клик по ячейке → карточка', async () => {
    const { user } = renderQueue();
    await waitFor(() => expect(reportLinks()).toHaveLength(3));
    await user.click(reportLinks()[1]!);
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(402)}`));
  });
});
