import type { AdminPurchase, PurchaseStatus } from '@/api/types';

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = { pending: 'Ожидает оплаты', paid: 'Оплачена', failed: 'Отклонена' };

export const PURCHASE_STATUS_TONES = { pending: 'warn', paid: 'ok', failed: 'bad' } as const;

/** Вкладки статуса. `all` — без параметра `?status=` на бэкенд. */
export type PurchaseTab = PurchaseStatus | 'all';

export const PURCHASE_TABS: { value: PurchaseTab; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'paid', label: 'Оплачены' },
  { value: 'pending', label: 'Ожидают' },
  { value: 'failed', label: 'Отклонены' },
];

/** Неизвестное значение в адресе — «Все», а не пустой экран. */
export function tabFromParam(value: string | null): PurchaseTab {
  return PURCHASE_TABS.some((tab) => tab.value === value) ? (value as PurchaseTab) : 'all';
}

/** Состояние ссылки на отчёт: у неоплаченной покупки её нет вовсе, у оплаченной она действует либо отозвана. */
export type AccessState = 'none' | 'active' | 'revoked' | 'expired';

export function accessState(purchase: Pick<AdminPurchase, 'status' | 'accessRevokedAt' | 'accessTokenExpiresAt'>, now: number = Date.now()): AccessState {
  if (purchase.status !== 'paid') return 'none';
  if (purchase.accessRevokedAt) return 'revoked';
  if (purchase.accessTokenExpiresAt && Date.parse(purchase.accessTokenExpiresAt) < now) return 'expired';
  return 'active';
}

export const ACCESS_LABELS: Record<AccessState, string> = { none: 'Нет ссылки', active: 'Действует', revoked: 'Отозвана', expired: 'Срок истёк' };

/** Покупатель одной строкой: email, телефон или оба. */
export function buyerLabel(purchase: Pick<AdminPurchase, 'buyerEmail' | 'buyerPhone'>): string {
  return [purchase.buyerEmail, purchase.buyerPhone].filter(Boolean).join(' · ') || 'Неизвестен';
}
