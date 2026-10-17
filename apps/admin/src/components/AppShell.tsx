import { Badge } from '@podbor/ui/components/ui/badge';
import { Button } from '@podbor/ui/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@podbor/ui/components/ui/drawer';
import { cn } from '@podbor/ui/lib/utils';
import { LogOut, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '@/auth/sessionContext';
import { useMenuCounts, type MenuCounts } from '@/features/counts/useMenuCounts';
import { ErrorBoundary } from './ErrorBoundary';
import { isNavActive, titleForPath, visibleNavItems } from './navItems';

const APP_NAME = 'Админка Подбор';

function CountBadge({ value }: { value: number | undefined }) {
  // Нет данных или ноль — число не рисуем: пустое меню чище, чем «0» у каждого пункта
  if (!value) return null;
  return (
    <Badge tone="warn" className="ml-auto" data-testid="nav-count">
      {value}
    </Badge>
  );
}

function NavList({ counts, onNavigate, label }: { counts: MenuCounts; onNavigate?: () => void; label: string }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {visibleNavItems().map((item) => {
          const active = isNavActive(pathname, item);
          // счётчики есть только у трёх пунктов (`MenuCounts`); у реестра, покупок и дашборда числа в меню нет
          const count = item.key in counts ? counts[item.key as keyof MenuCounts] : undefined;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNavigate}
                // не NavLink: он выставляет aria-current только по своему `to`, а «Модерация» активна и на /reports/:id
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-3 rounded-control px-3 text-body font-semibold outline-none transition focus-visible:ring-4 focus-visible:ring-ring',
                  active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                <item.icon className="size-5 shrink-0" aria-hidden />
                <span>{item.label}</span>
                <CountBadge value={count} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Каркас защищённой части: левое меню (на телефоне — шторка по бургеру), шапка с email и «Выйти»,
 * контент-область под границей ошибок. Экраны входа (`/login`, `/setup-totp`) сюда не входят.
 */
export function AppShell() {
  const { email, logout } = useSession();
  const counts = useMenuCounts();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Заголовок вкладки по экрану: пункт меню или название приложения
  useEffect(() => {
    const title = titleForPath(pathname);
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME;
  }, [pathname]);

  // Любой переход (в том числе кнопкой «Назад») закрывает шторку
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card p-4 md:sticky md:top-0 md:block md:h-dvh md:overflow-y-auto">
        <p className="mb-6 px-3 text-heading font-semibold">Подбор</p>
        <NavList counts={counts} label="Основное меню" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card px-4">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Открыть меню" onClick={() => setMenuOpen(true)}>
            <Menu />
          </Button>
          <p className="text-heading font-semibold md:hidden">Подбор</p>

          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span data-testid="admin-email" className="truncate text-body text-muted-foreground">
              {email}
            </span>
            <Button variant="secondary" size="sm" onClick={logout}>
              <LogOut aria-hidden />
              Выйти
            </Button>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Меню</DrawerTitle>
            <DrawerDescription className="sr-only">Разделы админки</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-2">
            <NavList counts={counts} label="Меню" onNavigate={() => setMenuOpen(false)} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
