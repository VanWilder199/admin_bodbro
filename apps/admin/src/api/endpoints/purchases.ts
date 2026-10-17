import { apiFetch } from '../client';
import type { AdminPurchase, AdminPurchaseDetail, PurchaseStatus, ReconcileResult, RevokeAccessRequest, RevokeAccessResponse } from '../types';

const purchasePath = (id: string) => `/admin/purchases/${encodeURIComponent(id)}`;

export const purchasesApi = {
  /** Без `status` — все. Массив целиком (BE-7): поиск по покупателю делает клиент. */
  list: (status?: PurchaseStatus) => apiFetch<AdminPurchase[]>(status ? `/admin/purchases?status=${encodeURIComponent(status)}` : '/admin/purchases'),

  get: (id: string) => apiFetch<AdminPurchaseDetail>(purchasePath(id)),

  /** Тело `{ reason }`, как у бана. Не оплаченная покупка → 409 PURCHASE_NOT_PAID. */
  revokeAccess: (id: string, data: RevokeAccessRequest) =>
    apiFetch<RevokeAccessResponse>(`${purchasePath(id)}/revoke-access`, { method: 'POST', body: JSON.stringify(data) }),

  /** Сверить зависшие платежи с bePaid (BE-8). */
  reconcile: () => apiFetch<ReconcileResult>('/admin/purchases/reconcile', { method: 'POST' }),
};
