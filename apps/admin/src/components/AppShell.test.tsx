import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import { SESSION_STORAGE_KEY } from '@/auth/session';
import { COUNTS_REFRESH_MS, invalidateMenuCounts } from '@/features/counts/useMenuCounts';
import { mail } from '@/mocks/fixtures/ids';
import { db, mockControl } from '@/mocks/state';
import { appRoutes } from '@/routes';
import { server } from '@/test/server';
import { recordRequests, renderRoutes, storeSession } from '@/test/utils';
import type { RouteObject } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RequireAuth } from '@/auth/RequireAuth';

function renderShell(route = '/moderation', routes: RouteObject[] = appRoutes) {
  storeSession();
  const user = userEvent.setup();
  return { user, ...renderRoutes(routes, route) };
}

const location = () => screen.getByTestId('location').textContent;
const sidebar = () => screen.getByRole('complementary');
const sidebarNav = () => within(sidebar()).getByRole('navigation', { name: 'Основное меню' });
const link = (name: string) => within(sidebarNav()).getByRole('link', { name: new RegExp(name) });

describe('меню', () => {
  it('«Отчёты» и «Покупки» скрыты, остальные пункты на месте', async () => {
    renderShell();
    await screen.findByTestId('admin-email');
    const labels = within(sidebarNav())
      .getAllByRole('link')
      .map((a) => a.textContent?.replace(/\d+$/, ''));
    expect(labels).toEqual(['Модерация', 'Подборщики', 'Выплаты']);
    expect(screen.queryByRole('link', { name: /Отчёты/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Покупки/ })).not.toBeInTheDocument();
  });

  it('счётчики: очередь, подборщики pending, выплаты pending (по фикстурам 3 / 2 / 2)', async () => {
    renderShell();
    await waitFor(() => expect(link('Модерация')).toHaveTextContent('3'));
    expect(link('Подборщики')).toHaveTextContent('2');
    expect(link('Выплаты')).toHaveTextContent('2');
  });

  it('нулевой счётчик не рисуется', async () => {
    db.inspectors.forEach((i) => (i.status = 'verified'));
    renderShell();
    await waitFor(() => expect(link('Модерация')).toHaveTextContent('3'));
    await waitFor(() => expect(within(link('Подборщики')).queryByTestId('nav-count')).not.toBeInTheDocument());
  });

  it('упавший запрос счётчика не ломает меню: число просто не показывается', async () => {
    mockControl.fail('GET /admin/payouts', { kind: 'app', status: 500, errorCode: 'INTERNAL_SERVER_ERROR' });
    renderShell();
    await waitFor(() => expect(link('Модерация')).toHaveTextContent('3'));
    expect(link('Выплаты')).toBeInTheDocument();
    expect(within(link('Выплаты')).queryByTestId('nav-count')).not.toBeInTheDocument();
  });

  it('активный пункт отмечен aria-current, остальные нет', async () => {
    renderShell('/inspectors');
    await screen.findByTestId('admin-email');
    expect(link('Подборщики')).toHaveAttribute('aria-current', 'page');
    expect(link('Модерация')).not.toHaveAttribute('aria-current');
  });

  it('карточка отчёта подсвечивает «Модерацию»', async () => {
    renderShell('/reports/5b1c');
    await screen.findByTestId('admin-email');
    expect(link('Модерация')).toHaveAttribute('aria-current', 'page');
  });

  it('клик по пункту переходит на раздел', async () => {
    const { user } = renderShell('/moderation');
    await screen.findByTestId('admin-email');
    await user.click(link('Выплаты'));
    await waitFor(() => expect(location()).toBe('/payouts'));
  });
});

describe('счётчики: обновление', () => {
  it('опрашиваются раз в минуту', async () => {
    const { queryClient } = renderShell();
    await waitFor(() => expect(link('Модерация')).toHaveTextContent('3'));

    for (const key of [queryKeys.moderationQueue, queryKeys.inspectors('pending'), queryKeys.payouts('pending')]) {
      const observer = queryClient.getQueryCache().find({ queryKey: key })!.observers[0]!;
      expect(observer.options.refetchInterval).toBe(COUNTS_REFRESH_MS);
    }
    expect(COUNTS_REFRESH_MS).toBe(60_000);
  });

  it('инвалидация после мутации перечитывает счётчики', async () => {
    const { queryClient } = renderShell();
    await waitFor(() => expect(link('Модерация')).toHaveTextContent('3'));

    db.reports[Object.keys(db.reports)[0]!]!.report.status = 'published'; // отчёт ушёл из очереди «на сервере»
    db.payouts.find((p) => p.status === 'pending')!.status = 'paid';
    await act(async () => {
      await invalidateMenuCounts(queryClient);
    });

    await waitFor(() => expect(link('Модерация')).toHaveTextContent('2'));
    expect(link('Выплаты')).toHaveTextContent('1');
  });

  it('счётчик и список читают один ключ: запрос уходит один раз, а не по разу на потребителя', async () => {
    const requests = recordRequests(server);
    renderShell();
    await waitFor(() => expect(link('Модерация')).toHaveTextContent('3'));
    expect(requests.filter((r) => r === 'GET /api/admin/reports/queue')).toHaveLength(1);
  });
});

describe('шапка и выход', () => {
  it('показывает email админа из GET /admin/', async () => {
    renderShell();
    await waitFor(() => expect(screen.getByTestId('admin-email')).toHaveTextContent(mail('admin')));
  });

  it('«Выйти» очищает сессию и кэш запросов и ведёт на /login', async () => {
    const { user, queryClient } = renderShell();
    await waitFor(() => expect(link('Модерация')).toHaveTextContent('3'));
    expect(queryClient.getQueryData(queryKeys.moderationQueue)).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(location()).toBe('/login'));
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(queryClient.getQueryData(queryKeys.moderationQueue)).toBeUndefined();
  });

  it('заголовок вкладки меняется по экрану', async () => {
    const { user } = renderShell('/moderation');
    await screen.findByTestId('admin-email'); // меню отрисовано — токен проверен
    await waitFor(() => expect(document.title).toBe('Модерация — Админка Подбор'));
    await user.click(link('Подборщики'));
    await waitFor(() => expect(document.title).toBe('Подборщики — Админка Подбор'));
  });
});

describe('маршруты внутри и вне AppShell', () => {
  it('/ ведёт на /moderation', async () => {
    renderShell('/');
    await waitFor(() => expect(location()).toBe('/moderation'));
  });

  it('неизвестный путь → 404 внутри layout: меню на месте', async () => {
    renderShell('/nowhere');
    expect(await screen.findByText('Страница не найдена')).toBeInTheDocument();
    expect(sidebar()).toBeInTheDocument();
    expect(link('Модерация')).toBeInTheDocument();
  });

  it('/login и /setup-totp рисуются без меню', async () => {
    localStorage.clear();
    renderRoutes(appRoutes, '/setup-totp');
    expect(await screen.findByText('Первый вход: настройка 2FA')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('все защищённые заглушки живут внутри layout', async () => {
    for (const path of ['/moderation', '/reports/5b1c', '/inspectors', '/payouts']) {
      const { unmount } = renderShell(path);
      await screen.findByTestId('admin-email');
      expect(sidebar()).toBeInTheDocument();
      unmount();
    }
  });
});

describe('исключение в экране', () => {
  function Bomb(): never {
    throw new Error('экран сломался');
  }
  const brokenRoutes: RouteObject[] = [
    {
      element: <RequireAuth />,
      children: [
        {
          element: <AppShell />,
          children: [
            { path: '/broken', element: <Bomb /> },
            { path: '/inspectors', element: <p>подборщики</p> },
          ],
        },
      ],
    },
  ];

  it('показывает «Что-то пошло не так» и «Обновить», а меню и шапка остаются', async () => {
    const consoleError = console.error;
    console.error = () => {};
    try {
      renderShell('/broken', brokenRoutes);
      expect(await screen.findByText('Что-то пошло не так')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
      expect(sidebar()).toBeInTheDocument();
      expect(screen.getByTestId('admin-email')).toBeInTheDocument();
    } finally {
      console.error = consoleError;
    }
  });

  it('переход в другой раздел из сломанного экрана работает без перезагрузки', async () => {
    const consoleError = console.error;
    console.error = () => {};
    try {
      const { user } = renderShell('/broken', brokenRoutes);
      await screen.findByText('Что-то пошло не так');
      await user.click(link('Подборщики'));
      expect(await screen.findByText('подборщики')).toBeInTheDocument();
      expect(screen.queryByText('Что-то пошло не так')).not.toBeInTheDocument();
    } finally {
      console.error = consoleError;
    }
  });
});

describe('мобильное меню (шторка)', () => {
  it('кнопка-бургер открывает шторку с теми же пунктами и счётчиками', async () => {
    const { user } = renderShell();
    await waitFor(() => expect(link('Модерация')).toHaveTextContent('3'));

    await user.click(screen.getByRole('button', { name: 'Открыть меню' }));

    const dialog = await screen.findByRole('dialog');
    const nav = within(dialog).getByRole('navigation', { name: 'Меню' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, ''))).toEqual(['Модерация', 'Подборщики', 'Выплаты']);
    expect(within(nav).getByRole('link', { name: /Подборщики/ })).toHaveTextContent('2');
  });

  it('выбор пункта в шторке переходит на раздел и закрывает шторку', async () => {
    const { user } = renderShell();
    await screen.findByTestId('admin-email');
    await user.click(screen.getByRole('button', { name: 'Открыть меню' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('link', { name: /Выплаты/ }));

    await waitFor(() => expect(location()).toBe('/payouts'));
    // vaul играет анимацию закрытия: в happy-dom она не завершается, и узел остаётся в DOM с data-state="closed"
    await waitFor(() => {
      const open = screen.queryByRole('dialog');
      expect(open === null || open.getAttribute('data-state') === 'closed').toBe(true);
    });
  });
});
