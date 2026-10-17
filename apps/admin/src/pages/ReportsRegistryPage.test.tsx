import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MOBILE_QUERY } from '@/hooks/useMediaQuery';
import { uuid } from '@/mocks/fixtures/ids';
import { mockControl } from '@/mocks/state';
import { server } from '@/test/server';
import { allScreensRoutes, enableFeatures } from '@/test/flags';
import { recordRequests, renderRoutes, storeSession } from '@/test/utils';
import { applyFilters, deletedFromParam, statusFromParam, toRow } from './ReportsRegistryPage';

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

function renderRegistry(route = '/reports') {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(allScreensRoutes, route) };
}

const location = () => screen.getByTestId('location').textContent;
const table = () => screen.findByRole('table');
const bodyRows = async () => within((await table()).querySelector('tbody')!).getAllByRole('row');
const titles = async () => (await bodyRows()).map((r) => within(within(r).getAllByRole('cell')[0]!).getByRole('link').textContent);
const tab = (name: string) => screen.getByRole('tab', { name });

describe('данные реестра', () => {
  it('по умолчанию все отчёты без удалённых: свежие сверху (порядок бэкенда)', async () => {
    renderRegistry();
    // 405 удалён и скрыт; остальные по createdAt DESC: 403, 401, 404, 402
    expect(await titles()).toEqual(['Skoda', 'Volkswagen Passat 2017', 'Skoda Octavia 2017', 'BMW 520d 2011']);
  });

  it('в строке: статус, подборщик, цена в рублях, число покупок', async () => {
    renderRegistry();
    const row = (await bodyRows())[2]!; // 404 — опубликован, две оплаты
    expect(row).toHaveTextContent('Опубликован');
    expect(row).toHaveTextContent('Мария Лисицына');
    expect(row).toHaveTextContent(/4\s?100 BYN/);
    expect(within(row).getAllByRole('cell')[4]).toHaveTextContent('2');
  });

  it('клик по строке открывает карточку отчёта', async () => {
    const { user } = renderRegistry();
    await user.click(within((await bodyRows())[1]!).getAllByRole('cell')[3]!);
    await waitFor(() => expect(location()).toBe(`/reports/${uuid(401)}`));
  });

  it('пункт меню «Отчёты» включён флагом и подсвечен на /reports, но не на /reports/:id', async () => {
    const { unmount } = renderRegistry();
    await table();
    const nav = screen.getByRole('navigation', { name: 'Основное меню' });
    expect(within(nav).getByRole('link', { name: /Отчёты/ })).toHaveAttribute('aria-current', 'page');
    unmount();

    renderRegistry(`/reports/${uuid(401)}`);
    const nav2 = await screen.findByRole('navigation', { name: 'Основное меню' });
    expect(within(nav2).getByRole('link', { name: /Отчёты/ })).not.toHaveAttribute('aria-current');
    expect(within(nav2).getByRole('link', { name: /Модерация/ })).toHaveAttribute('aria-current', 'page');
  });
});

describe('фильтры на клиенте', () => {
  it('смена статуса и удалённых не делает повторных запросов', async () => {
    const requests = recordRequests(server);
    const { user } = renderRegistry();
    await table();
    const registryRequests = () => requests.filter((r) => r === 'GET /api/admin/reports');
    expect(registryRequests()).toHaveLength(1);

    await user.click(tab('Опубликованы'));
    await waitFor(() => expect(location()).toBe('/reports?status=published'));
    expect(await titles()).toEqual(['Skoda Octavia 2017']);

    await user.click(tab('С удалёнными'));
    await waitFor(() => expect(location()).toBe('/reports?status=published&deleted=any'));
    // 405 создан позже 404, поэтому в порядке «свежие сверху» он первый
    expect(await titles()).toEqual(['Renault Megane 2016', 'Skoda Octavia 2017']);

    expect(registryRequests()).toHaveLength(1);
  });

  it('«Только удалённые» показывает удалённый отчёт с чипом «Удалён», а не статусом', async () => {
    const { user } = renderRegistry();
    await table();
    await user.click(tab('Только удалённые'));
    const rows = await bodyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Renault Megane 2016');
    expect(rows[0]).toHaveTextContent('Удалён');
    expect(rows[0]).not.toHaveTextContent('Опубликован');
  });

  it('поиск по VIN, марке и подборщику; значение в ?q=', async () => {
    const { user } = renderRegistry();
    await table();
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по отчётам' }), 'лисицын');
    await waitFor(() => expect(location()).toContain('q='));
    expect(await titles()).toEqual(['Skoda Octavia 2017', 'BMW 520d 2011']);
  });

  it('переход с предустановленным фильтром по подборщику; чип сбрасывает фильтр', async () => {
    const { user } = renderRegistry(`/reports?inspectorId=${uuid(104)}`);
    expect(await titles()).toEqual(['Skoda Octavia 2017', 'BMW 520d 2011']);
    await user.click(screen.getByRole('button', { name: /Сбросить фильтр: Подборщик: Мария Лисицына/ }));
    await waitFor(() => expect(location()).toBe('/reports'));
    expect(await titles()).toHaveLength(4);
  });

  it('фильтр по машине (carId)', async () => {
    renderRegistry(`/reports?carId=${uuid(202)}`);
    expect(await titles()).toEqual(['BMW 520d 2011']);
  });

  it('неизвестный статус в URL → фильтр сброшен, а не пустой список', async () => {
    renderRegistry('/reports?status=nonsense&deleted=nonsense');
    expect(await titles()).toHaveLength(4);
    expect(tab('Все')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Без удалённых')).toHaveAttribute('aria-selected', 'true');
  });

  it('чистые функции: параметры и фильтры', async () => {
    expect(statusFromParam('published')).toBe('published');
    expect(statusFromParam('x')).toBe('all');
    expect(statusFromParam(null)).toBe('all');
    expect(deletedFromParam('only')).toBe('only');
    expect(deletedFromParam('x')).toBe('hide');

    const base = {
      reportId: 'r', status: 'published' as const, deletedAt: null, carId: 'c', vin: null, make: 'A', model: null, year: null,
      inspectorId: 'i', inspectorName: 'N', priceByn: 1, createdAt: '2026-01-01T00:00:00Z', submittedAt: null, paidPurchasesCount: 0,
    };
    const rows = [toRow(base), toRow({ ...base, reportId: 'r2', deletedAt: '2026-02-01T00:00:00Z' })];
    expect(applyFilters(rows, { status: 'all', deleted: 'hide', inspectorId: null, carId: null }).map((r) => r.reportId)).toEqual(['r']);
    expect(applyFilters(rows, { status: 'all', deleted: 'only', inspectorId: null, carId: null }).map((r) => r.reportId)).toEqual(['r2']);
    expect(applyFilters(rows, { status: 'draft', deleted: 'any', inspectorId: null, carId: null })).toEqual([]);
  });
});

describe('состояния', () => {
  it('ошибка загрузки → «Повторить»', async () => {
    mockControl.failOnce('GET /admin/reports', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderRegistry();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ошибка сервера. Попробуйте позже');
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }));
    expect(await table()).toBeInTheDocument();
  });

  it('фильтры, под которые ничего не подходит → пустое состояние', async () => {
    renderRegistry('/reports?status=draft');
    expect(await screen.findByText('Нет отчётов с такими фильтрами')).toBeInTheDocument();
  });

  it('телефон: список ячеек вместо таблицы', async () => {
    setViewport(true);
    renderRegistry();
    await waitFor(() => expect(screen.queryAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/reports/'))).toHaveLength(4));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('меню без флагов', () => {
  it('пока флаг выключен, /reports — 404 внутри layout', async () => {
    const { appRoutes } = await import('@/routes');
    // appRoutes собран при `features.reports === false` (в тестах `VITE_API_MOCKS` не задан)
    storeSession();
    renderRoutes(appRoutes, '/reports');
    expect(await screen.findByText(/не найден/i)).toBeInTheDocument();
  });
});
