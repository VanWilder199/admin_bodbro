import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import { mockControl } from '@/mocks/state';
import { allScreensRoutes, enableFeatures } from '@/test/flags';
import { renderRoutes, storeSession } from '@/test/utils';
import { STATS_REFRESH_MS } from './DashboardPage';

enableFeatures();

function renderDashboard(route = '/') {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(allScreensRoutes, route) };
}

const location = () => screen.getByTestId('location').textContent;
const tile = (key: string) => screen.findByTestId(`tile-${key}`);

describe('дашборд', () => {
  it('/ показывает дашборд вместо редиректа на модерацию', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { level: 1, name: 'Дашборд' })).toBeInTheDocument();
    expect(location()).toBe('/');
  });

  it('счётчики из GET /admin/stats по фикстурам', async () => {
    renderDashboard();
    expect(await tile('pendingReview')).toHaveTextContent('3');
    expect(await tile('inspectorsPending')).toHaveTextContent('2');
    expect(await tile('payoutBatchesPending')).toHaveTextContent('2');
    // 125 000 + 48 750 копеек
    expect(await tile('payoutBatchesPending')).toHaveTextContent(/1\s?737,50 BYN/);
    expect(await tile('unbatchedPayoutsAmountByn')).toHaveTextContent(/750 BYN/);
    expect(await tile('purchasesStuckPending')).toHaveTextContent('2');
  });

  it('деньги в копейках показаны в BYN, а не «410000»', async () => {
    renderDashboard();
    expect(await tile('revenueLast30dByn')).toHaveTextContent(/6\s?000 BYN/);
    expect(screen.queryByText(/600\s?000/)).not.toBeInTheDocument();
  });

  it('карточка, требующая внимания, выделена; нулевая — нет', async () => {
    renderDashboard();
    expect((await tile('pendingReview')).querySelector('[data-slot=card]')).toHaveClass('ring-2');
    expect((await tile('revisionRequired')).querySelector('[data-slot=card]')).not.toHaveClass('ring-2');
  });

  it.each([
    ['pendingReview', '/moderation'],
    ['revisionRequired', '/reports?status=revision_required'],
    ['inspectorsPending', '/inspectors?status=pending'],
    ['payoutBatchesPending', '/payouts?status=pending'],
    ['purchasesStuckPending', '/purchases?status=pending'],
    ['purchasesPaidLast30d', '/purchases?status=paid'],
  ])('карточка %s ведёт на отфильтрованный список %s', async (key, target) => {
    const { user } = renderDashboard();
    await user.click(await tile(key));
    await waitFor(() => expect(location()).toBe(target));
  });

  it('обновляется раз в минуту', async () => {
    const { queryClient } = renderDashboard();
    await tile('pendingReview');
    const observers = queryClient.getQueryCache().find({ queryKey: queryKeys.stats })!.observers;
    expect(observers.some((o) => o.options.refetchInterval === STATS_REFRESH_MS)).toBe(true);
    expect(STATS_REFRESH_MS).toBe(60_000);
  });

  it('после решения по отчёту счётчики помечены устаревшими и при возврате на дашборд показывают новые значения', async () => {
    const { user, queryClient } = renderDashboard();
    expect(await tile('pendingReview')).toHaveTextContent('3');

    await user.click(screen.getByRole('link', { name: /Модерация/ }));
    await user.click((await screen.findAllByRole('link')).find((a) => a.getAttribute('href') === '/reports/00000000-0000-4000-8000-000000000401')!);
    await user.click(await screen.findByRole('button', { name: /Одобрить/ }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Опубликовать' }));

    // дашборд сейчас не на экране, поэтому запрос не перечитывается сразу, а помечается устаревшим
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.stats)?.isInvalidated).toBe(true));

    await user.click(within(screen.getByRole('navigation', { name: 'Основное меню' })).getByRole('link', { name: /Дашборд/ }));
    await waitFor(async () => expect(await tile('pendingReview')).toHaveTextContent('2'));
  });

  it('ошибка загрузки → «Повторить»', async () => {
    mockControl.failOnce('GET /admin/stats', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    const { user } = renderDashboard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ошибка сервера. Попробуйте позже');
    await user.click(within(alert).getByRole('button', { name: 'Повторить' }));
    expect(await tile('pendingReview')).toBeInTheDocument();
  });

  it('пункт «Дашборд» в меню подсвечен только на /', async () => {
    renderDashboard();
    await tile('pendingReview');
    const nav = screen.getByRole('navigation', { name: 'Основное меню' });
    expect(within(nav).getByRole('link', { name: /Дашборд/ })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: /Модерация/ })).not.toHaveAttribute('aria-current');
  });
});
