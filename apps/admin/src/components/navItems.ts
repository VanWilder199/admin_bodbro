import { ClipboardCheck, FileText, LayoutDashboard, ShoppingCart, Users, Wallet, type LucideIcon } from 'lucide-react';
import { features, type Features } from '@/features/flags';
import type { MenuCounts } from '@/features/counts/useMenuCounts';

export interface NavItem {
  key: keyof MenuCounts | 'dashboard' | 'reports' | 'purchases';
  to: string;
  label: string;
  icon: LucideIcon;
  /** Флаг, без которого пункта нет в меню. Читается при каждом показе меню, а не при загрузке модуля. */
  flag?: 'dashboard' | 'reports' | 'purchases';
  /** Пункт подсвечен на этих путях: например, карточка отчёта относится к модерации. */
  activePrefixes: string[];
  /** Подсвечивать только на точном совпадении пути: у `/` и `/reports` есть «дочерние» пути, которые принадлежат другим пунктам. */
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', to: '/', label: 'Дашборд', icon: LayoutDashboard, flag: 'dashboard', activePrefixes: ['/'], exact: true },
  // `/reports/:id` открывают из очереди, поэтому «Модерация» остаётся активной; реестру принадлежит ровно `/reports`
  { key: 'moderation', to: '/moderation', label: 'Модерация', icon: ClipboardCheck, activePrefixes: ['/moderation', '/reports/'] },
  { key: 'reports', to: '/reports', label: 'Отчёты', icon: FileText, flag: 'reports', activePrefixes: ['/reports'], exact: true },
  { key: 'inspectors', to: '/inspectors', label: 'Подборщики', icon: Users, activePrefixes: ['/inspectors'] },
  { key: 'payouts', to: '/payouts', label: 'Выплаты', icon: Wallet, activePrefixes: ['/payouts'] },
  { key: 'purchases', to: '/purchases', label: 'Покупки', icon: ShoppingCart, flag: 'purchases', activePrefixes: ['/purchases'] },
];

/** Пункты, доступные при заданных флагах. Без аргументов — по флагам приложения. */
export function visibleNavItems(flags: Pick<Features, 'dashboard' | 'reports' | 'purchases'> = features, items: NavItem[] = NAV_ITEMS): NavItem[] {
  return items.filter((item) => !item.flag || flags[item.flag]);
}

/** Путь совпадает с префиксом по границе сегмента: `/payouts-old` не подсвечивает «Выплаты». */
export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return item.activePrefixes.includes(pathname);
  return item.activePrefixes.some((prefix) => (prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

/** Заголовок вкладки по пути: берётся из пункта меню, иначе `null`. */
export function titleForPath(pathname: string): string | null {
  return NAV_ITEMS.find((item) => isNavActive(pathname, item))?.label ?? null;
}
