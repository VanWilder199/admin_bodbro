import type { ReactNode } from 'react';
import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { resolveReturnTo } from './returnTo';
import { useSession } from './sessionContext';

/** `/login` и `/setup-totp`: с живой сессией сюда делать нечего — уходим на `returnTo` или в модерацию. */
export function GuestOnly({ children }: { children?: ReactNode }) {
  const { session } = useSession();
  const [params] = useSearchParams();

  if (session) return <Navigate to={resolveReturnTo(params.get('returnTo'))} replace />;
  return <>{children ?? <Outlet />}</>;
}
