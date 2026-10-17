import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { Outlet, type RouteObject } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GuestOnly } from './GuestOnly';
import { RequireAuth } from './RequireAuth';
import { LOGOUT_MARGIN_MS, WARN_BEFORE_MS } from './SessionProvider';
import { SESSION_STORAGE_KEY } from './session';
import { useSession } from './sessionContext';
import { mail, MOCK_TOKEN } from '@/mocks/fixtures/ids';
import { mockControl } from '@/mocks/state';
import { LoginPage } from '@/pages/LoginPage';
import { server } from '@/test/server';
import { recordRequests, renderRoutes, storeSession } from '@/test/utils';

const EMAIL = mail('probe');

/** Защищённый экран-пробник: показывает email из контекста, состояние баннера и кнопку выхода. */
function Protected() {
  const { email, logout, expiresSoon } = useSession();
  return (
    <div>
      <span data-testid="email">{email}</span>
      <span data-testid="soon">{String(expiresSoon)}</span>
      <button onClick={logout}>Выйти</button>
    </div>
  );
}

/** Имитирует успешный `POST /admin/auth/login`: кладёт сессию без сетевых запросов. */
function AutoLogin({ expiresIn }: { expiresIn: number }) {
  const { login } = useSession();
  useEffect(() => {
    login(MOCK_TOKEN, expiresIn, EMAIL);
  }, [login, expiresIn]);
  return null;
}

function renderApp({ route = '/payouts', autoLogin }: { route?: string; autoLogin?: number } = {}) {
  const routes: RouteObject[] = [
    {
      // AutoLogin стоит внутри SessionProvider и нужен только тестам с фейковыми часами
      element: (
        <>
          {autoLogin !== undefined && <AutoLogin expiresIn={autoLogin} />}
          <Outlet />
        </>
      ),
      children: [
        { element: <GuestOnly />, children: [{ path: '/login', element: <LoginPage /> }] },
        {
          element: <RequireAuth />,
          children: [
            { path: '/payouts', element: <Protected /> },
            { path: '/moderation', element: <Protected /> },
          ],
        },
      ],
    },
  ];
  return renderRoutes(routes, route);
}

const location = () => screen.getByTestId('location').textContent;
const stored = () => localStorage.getItem(SESSION_STORAGE_KEY);

describe('восстановление сессии после перезагрузки', () => {
  it('живой токен → остаёмся на странице, GET /admin/ вызывается ровно один раз', async () => {
    storeSession({ email: 'stale@local' });
    const requests = recordRequests(server);
    renderApp({ route: '/payouts' });

    // email приходит с сервера (GET /admin/), а не из сохранённой сессии
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent(mail('admin')));
    expect(location()).toBe('/payouts');
    expect(requests.filter((r) => r === 'GET /api/admin/')).toHaveLength(1);
  });

  it('пока токен проверяется — сплэш, а не защищённый экран', async () => {
    storeSession();
    renderApp();
    expect(screen.getByLabelText('Загрузка')).toBeInTheDocument();
    expect(screen.queryByTestId('email')).not.toBeInTheDocument();
    await screen.findByTestId('email');
  });

  it('нет сессии → /login?returnTo=<путь>, без сообщения «сессия истекла»', async () => {
    renderApp({ route: '/payouts?status=pending' });
    await waitFor(() => expect(location()).toBe('/login?returnTo=%2Fpayouts%3Fstatus%3Dpending'));
    expect(screen.queryByText('Сессия истекла, войдите снова')).not.toBeInTheDocument();
  });

  it('токен с истёкшим сроком в хранилище → на вход без запроса к бэкенду', async () => {
    storeSession({ expiresInMs: -1000 });
    const requests = recordRequests(server);
    renderApp({ route: '/payouts' });
    await waitFor(() => expect(location()).toMatch(/^\/login/));
    expect(requests).toEqual([]);
  });

  it('GET /admin/ ответил 401 (токен отозван) → /login?returnTo=… с сообщением «Сессия истекла», хранилище очищено', async () => {
    storeSession();
    mockControl.fail('GET /admin/', { kind: 'security', status: 401 });
    renderApp({ route: '/payouts' });

    await waitFor(() => expect(location()).toBe('/login?returnTo=%2Fpayouts'));
    expect(screen.getByRole('status')).toHaveTextContent('Сессия истекла, войдите снова');
    expect(stored()).toBeNull();
  });

  it('токен покупателя (403) обрабатывается как конец сессии', async () => {
    storeSession({ accessToken: 'buyer-token' });
    renderApp({ route: '/moderation' });
    await waitFor(() => expect(location()).toBe('/login?returnTo=%2Fmoderation'));
    expect(stored()).toBeNull();
  });

  it('сеть или 5xx при проверке токена → сессию не сбрасываем, показываем «Повторить»', async () => {
    const user = userEvent.setup();
    storeSession();
    mockControl.failOnce('GET /admin/', { kind: 'network' });
    renderApp({ route: '/payouts' });

    expect(await screen.findByText('Не удалось проверить вход')).toBeInTheDocument();
    expect(stored()).not.toBeNull();
    expect(location()).toBe('/payouts');

    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.getByTestId('email')).toHaveTextContent(mail('admin')));
  });
});

describe('выход', () => {
  it('кнопка выхода: сессия удалена, кэш запросов очищен, на /login без returnTo и без сообщения', async () => {
    const user = userEvent.setup();
    storeSession();
    const { queryClient } = renderApp({ route: '/payouts' });
    await screen.findByTestId('email');
    queryClient.setQueryData(['some', 'data'], { secret: 1 });

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => expect(location()).toBe('/login'));
    expect(stored()).toBeNull();
    expect(queryClient.getQueryData(['some', 'data'])).toBeUndefined();
    expect(screen.queryByText('Сессия истекла, войдите снова')).not.toBeInTheDocument();
  });

  it('запрос на бэкенд при выходе не уходит (эндпоинта нет)', async () => {
    const user = userEvent.setup();
    storeSession();
    renderApp({ route: '/payouts' });
    await screen.findByTestId('email');
    const requests = recordRequests(server);

    await user.click(screen.getByRole('button', { name: 'Выйти' }));
    await waitFor(() => expect(location()).toBe('/login'));
    expect(requests).toEqual([]);
  });
});

describe('синхронизация вкладок', () => {
  it('выход в другой вкладке → выход здесь, с пояснением', async () => {
    storeSession();
    renderApp({ route: '/payouts' });
    await screen.findByTestId('email');

    act(() => {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY, newValue: null }));
    });

    await waitFor(() => expect(location()).toBe('/login'));
    expect(screen.getByRole('status')).toHaveTextContent('Вы вышли из админки в другой вкладке');
  });

  it('localStorage.clear() в другой вкладке (key = null) тоже выходит', async () => {
    storeSession();
    renderApp({ route: '/payouts' });
    await screen.findByTestId('email');

    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    await waitFor(() => expect(location()).toBe('/login'));
  });

  it('вход в другой вкладке → здесь страница входа уходит на returnTo без повторной проверки токена', async () => {
    renderApp({ route: '/login?returnTo=%2Fpayouts' });
    const requests = recordRequests(server);

    act(() => {
      storeSession();
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_STORAGE_KEY }));
    });

    await waitFor(() => expect(location()).toBe('/payouts'));
    expect(screen.getByTestId('email')).toBeInTheDocument();
    expect(requests).toEqual([]);
  });

  it('чужие ключи localStorage игнорируются', async () => {
    storeSession();
    renderApp({ route: '/payouts' });
    await screen.findByTestId('email');

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'другое', newValue: 'x' }));
    });
    expect(location()).toBe('/payouts');
  });
});

describe('истечение сессии (фейковые часы)', () => {
  afterEach(() => vi.useRealTimers());

  const minutes = (n: number) => n * 60_000;

  function advance(ms: number) {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  it('баннер появляется за 10 минут до конца токена, автовыход — за минуту до него', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    // токен на 30 минут: баннер на 20-й минуте, выход на 29-й
    renderApp({ route: '/payouts', autoLogin: 30 * 60 });

    expect(screen.getByTestId('soon')).toHaveTextContent('false');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    advance(minutes(30) - WARN_BEFORE_MS - 1000);
    expect(screen.getByTestId('soon')).toHaveTextContent('false');

    advance(1000);
    expect(screen.getByTestId('soon')).toHaveTextContent('true');
    expect(screen.getByRole('status')).toHaveTextContent('Сессия закончится в');

    advance(WARN_BEFORE_MS - LOGOUT_MARGIN_MS - 1000);
    expect(screen.getByTestId('soon')).toBeInTheDocument();
    expect(stored()).not.toBeNull();

    advance(1000); // дошли до expiresAt − 60 с
    expect(location()).toBe('/login?returnTo=%2Fpayouts');
    expect(stored()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Сессия истекла, войдите снова');
  });

  it('токен, до конца которого меньше 10 минут, показывает баннер сразу', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    renderApp({ route: '/payouts', autoLogin: 5 * 60 });
    expect(screen.getByTestId('soon')).toHaveTextContent('true');
  });

  it('токен короче минуты выкидывает сразу', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    renderApp({ route: '/payouts', autoLogin: 30 });
    expect(location()).toMatch(/^\/login/);
    expect(stored()).toBeNull();
  });

  it('если вкладка спала дольше срока (таймеры не отработали), возврат на вкладку выходит сразу', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    renderApp({ route: '/payouts', autoLogin: 30 * 60 });

    // часы ушли вперёд, а таймеры «заснули»: двигаем только Date
    vi.setSystemTime(Date.now() + minutes(45));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(location()).toMatch(/^\/login/);
    expect(stored()).toBeNull();
  });

  it('повторный вход после выхода сбрасывает баннер и причину выхода', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    renderApp({ route: '/payouts', autoLogin: 5 * 60 });
    expect(screen.getByTestId('soon')).toHaveTextContent('true');

    advance(minutes(5)); // дошли до автовыхода
    expect(location()).toMatch(/^\/login/);
    expect(screen.getByRole('status')).toHaveTextContent('Сессия истекла, войдите снова');
  });
});
