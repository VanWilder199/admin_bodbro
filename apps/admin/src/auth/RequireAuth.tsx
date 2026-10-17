import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@podbor/ui/components/ui/button';
import { Card } from '@podbor/ui/components/card';
import { safeReturnTo } from './returnTo';
import { SessionExpiryBanner } from './SessionExpiryBanner';
import { useSession } from './sessionContext';

function Centered({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-6">{children}</main>;
}

/**
 * Обёртка над защищёнными роутами (`<Route element={<RequireAuth />}>` или с `children`).
 * Нет живой сессии → `/login?returnTo=…`; пока токен проверяется — сплэш.
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { session, isLoading, error, endReason, logout, retry } = useSession();
  const location = useLocation();

  if (!session) {
    // После явного выхода (в этой или другой вкладке) возвращаться некуда — просто на вход.
    if (endReason === 'logout' || endReason === 'other-tab') {
      return <Navigate to="/login" replace state={endReason === 'other-tab' ? { reason: 'other-tab' } : null} />;
    }
    const returnTo = safeReturnTo(location.pathname + location.search + location.hash);
    const search = returnTo && returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
    return <Navigate to={`/login${search}`} replace state={endReason === 'expired' ? { reason: 'expired' } : null} />;
  }

  if (isLoading) {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Загрузка" />
      </Centered>
    );
  }

  // Сеть или 5xx при проверке токена: сессия может быть живой, поэтому не выкидываем на вход.
  if (error) {
    return (
      <Centered>
        <Card className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-heading font-semibold">Не удалось проверить вход</h1>
          <p className="text-body text-muted-foreground">
            {error.status === 0 ? 'Нет связи с сервером.' : 'Сервер временно недоступен.'} Сессия сохранена — повторите попытку.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={retry}>Повторить</Button>
            <Button variant="ghost" onClick={logout}>
              Выйти
            </Button>
          </div>
        </Card>
      </Centered>
    );
  }

  return (
    <>
      <SessionExpiryBanner />
      {children ?? <Outlet />}
    </>
  );
}
