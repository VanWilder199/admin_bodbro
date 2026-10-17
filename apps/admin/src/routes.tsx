import { Navigate, type RouteObject } from 'react-router-dom';
import { GuestOnly } from '@/auth/GuestOnly';
import { RequireAuth } from '@/auth/RequireAuth';
import { AppShell } from '@/components/AppShell';
import { features, type Features } from '@/features/flags';
import { DashboardPage } from '@/pages/DashboardPage';
import { InspectorsPage } from '@/pages/InspectorsPage';
import { LoginPage } from '@/pages/LoginPage';
import { ModerationQueuePage } from '@/pages/ModerationQueuePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PayoutsPage } from '@/pages/PayoutsPage';
import { PurchasesPage } from '@/pages/PurchasesPage';
import { ReportDetailPage } from '@/pages/ReportDetailPage';
import { ReportsRegistryPage } from '@/pages/ReportsRegistryPage';
import { SetupTotpPage } from '@/pages/SetupTotpPage';
import { TestPage } from '@/pages/TestPage';

/*
 * Роуты админки в объектной форме: для `useBlocker` (предупреждение при уходе со страницы с QR) нужен data router.
 * `/login` и `/setup-totp` стоят вне `AppShell`; все защищённые экраны — внутри него, включая 404.
 * Экраны за флагами (`features`): `/` дашборд, `/reports` реестр, `/purchases` покупки — есть только когда включены, иначе путь даёт 404.
 */
export type RouteFlags = Pick<Features, 'dashboard' | 'reports' | 'purchases'>;

/** Маршруты под заданные флаги: приложение берёт `features`, тесты включают нужные экраны явно. */
export function createAppRoutes(flags: RouteFlags): RouteObject[] {
  return [
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/setup-totp', element: <SetupTotpPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          // Дашборд вместо редиректа, когда есть `GET /admin/stats` (ADM-14)
          { path: '/', element: flags.dashboard ? <DashboardPage /> : <Navigate to="/moderation" replace /> },
          { path: '/moderation', element: <ModerationQueuePage /> },
          ...(flags.reports ? [{ path: '/reports', element: <ReportsRegistryPage /> }] : []),
          { path: '/reports/:id', element: <ReportDetailPage /> },
          { path: '/inspectors', element: <InspectorsPage /> },
          { path: '/payouts', element: <PayoutsPage /> },
          ...(flags.purchases ? [{ path: '/purchases', element: <PurchasesPage /> }] : []),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  // Песочница компонентов на моках — только в dev-сборке, до витрины /dev/ui (DS-07)
  ...(import.meta.env.DEV ? [{ path: '/test', element: <TestPage /> }] : []),
  ];
}

export const appRoutes: RouteObject[] = createAppRoutes(features);
