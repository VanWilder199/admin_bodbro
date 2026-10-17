import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { payoutsApi } from '@/api/endpoints/payouts';
import { getErrorMessage } from '@/api/errorMessages';
import { queryKeys } from '@/api/queryKeys';
import type { PayoutBatch } from '@/api/types';
import { formatByn } from '@podbor/ui/lib/format';
import type { RunResult } from '@/features/moderation/useModerationActions';

/**
 * Отметить батч оплаченным. Пессимистично и необратимо: после 200 нет ни отмены, ни письма подборщику.
 * В путь подставляется `batch.uuid`, а не `id` (у батча поля `id` нет).
 *
 * `404 PAYOUT_NOT_FOUND` бэкенд отдаёт и для несуществующего, и для УЖЕ оплаченного батча (атомарный
 * `UPDATE … WHERE status = 'pending'`), поэтому трактуем его как «уже оплачен или исчез»: тост и перезапрос списка.
 */
export function usePayBatch() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mutation = useMutation({ mutationFn: (uuid: string) => payoutsApi.pay(uuid) });

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.payoutsRoot }), queryClient.invalidateQueries({ queryKey: queryKeys.stats })]);

  const run = async (batch: PayoutBatch): Promise<RunResult> => {
    if (inFlight.current) return { kind: 'busy' };
    inFlight.current = true;

    try {
      await mutation.mutateAsync(batch.uuid);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;

      if (err?.errorCode === 'PAYOUT_NOT_FOUND') {
        toast.warning(getErrorMessage(err.errorCode));
        void refresh();
        return { kind: 'conflict' };
      }

      // 401/403: сессию уже завершил глобальный обработчик клиента, а редирект на /login сделает RequireAuth
      if (err?.status === 401 || err?.status === 403) return { kind: 'failed' };

      toast.error(err?.status === 0 ? 'Нет связи с сервером. Попробуйте ещё раз' : getErrorMessage(err?.errorCode));
      return { kind: 'failed' };
    } finally {
      inFlight.current = false;
    }

    // Батч сразу уходит из «К оплате»; в «Оплачено» и «Все» его положит перезапрос — `paidAt` проставляет сервер
    queryClient.setQueryData<PayoutBatch[]>(queryKeys.payouts('pending'), (old) => old?.filter((item) => item.uuid !== batch.uuid));
    void refresh();
    toast.success(`Оплата отмечена: ${batch.inspectorName}, ${formatByn(batch.amountByn)}`);
    return { kind: 'done' };
  };

  return { run, isPending: mutation.isPending };
}
