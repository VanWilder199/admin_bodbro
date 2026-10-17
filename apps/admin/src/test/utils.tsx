import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@podbor/ui/components/ui/sonner';
import { render } from '@testing-library/react';
import { Outlet, RouterProvider, createMemoryRouter, useLocation, type RouteObject } from 'react-router-dom';
import { SessionProvider } from '@/auth/SessionProvider';
import { SESSION_STORAGE_KEY } from '@/auth/session';
import { MOCK_TOKEN, mail } from '@/mocks/fixtures/ids';

/** QueryClient для тестов: без повторов, иначе ошибка сети ждала бы бэкофф в секунды. */
export function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
}

/** Показывает текущий адрес: `pathname + search` в `data-testid="location"`. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <span data-testid="location">{pathname + search}</span>;
}

/**
 * Рендер маршрутов так же, как в приложении: QueryClient → SessionProvider → data router.
 * К маршрутам добавляется пробник адреса (`data-testid="location"`).
 */
export function renderRoutes(routes: RouteObject[], route: string) {
  const queryClient = createTestQueryClient();
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <Outlet />
            <LocationProbe />
          </>
        ),
        children: routes,
      },
    ],
    { initialEntries: [route] },
  );
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
      {/* тосты рисует Toaster: без него проверки вида «появился тост» ничего бы не нашли */}
      <Toaster />
    </QueryClientProvider>,
  );
  return { queryClient, router, ...utils };
}

/** Положить сессию в localStorage так, как это сделал бы `login`. */
export function storeSession({
  accessToken = MOCK_TOKEN,
  expiresInMs = 60 * 60 * 1000,
  email = mail('admin'),
}: { accessToken?: string; expiresInMs?: number; email?: string } = {}) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ accessToken, expiresAt: Date.now() + expiresInMs, email }));
}

/** Все запросы, которые ушли в сеть, как `METHOD /path`. */
export function recordRequests(server: { events: { on: (type: 'request:start', listener: (e: { request: Request }) => void) => unknown } }) {
  const requests: string[] = [];
  server.events.on('request:start', ({ request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`);
  });
  return requests;
}
