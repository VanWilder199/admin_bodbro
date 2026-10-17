import { apiFetch } from '../client';
import type { PayoutBatch, PayoutBatchDetail, PayoutStatus, RunBatchesResult, UnbatchedPayout } from '../types';

export const payoutsApi = {
  /** Без `status` — все. */
  list: (status?: PayoutStatus) =>
    apiFetch<PayoutBatch[]>(status ? `/admin/payouts?status=${encodeURIComponent(status)}` : '/admin/payouts'),

  /** `uuid` батча (не `id`). 200 без тела; повторная оплата и неизвестный uuid — одинаково 404 PAYOUT_NOT_FOUND. */
  pay: (uuid: string) => apiFetch<void>(`/admin/payouts/${encodeURIComponent(uuid)}/pay`, { method: 'POST' }),

  /** Состав батча (BE-8). */
  get: (uuid: string) => apiFetch<PayoutBatchDetail>(`/admin/payouts/${encodeURIComponent(uuid)}`),

  /** Начисления, накопленные, но ещё не попавшие в батч (BE-8). */
  unbatched: () => apiFetch<UnbatchedPayout[]>('/admin/payouts/unbatched'),

  /** Сформировать батчи сейчас, не дожидаясь 1-го числа (BE-8). */
  runBatches: () => apiFetch<RunBatchesResult>('/admin/payouts/run-batches', { method: 'POST' }),
};
