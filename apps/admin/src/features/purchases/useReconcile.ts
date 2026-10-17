import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { purchasesApi } from '@/api/endpoints/purchases';
import { getErrorMessage } from '@/api/errorMessages';
import { queryKeys } from '@/api/queryKeys';
import type { ReconcileResult } from '@/api/types';

/** Итог сверки одной фразой для тоста. */
export function reconcileMessage(result: ReconcileResult): string {
  if (result.checked === 0) return 'Зависших платежей нет';
  return `Проверено: ${result.checked}. Оплачено: ${result.markedPaid}, отклонено: ${result.markedFailed}`;
}

/** Сверить зависшие платежи с bePaid. Повторное нажатие во время выполнения игнорируется. */
export function useReconcile() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mutation = useMutation({ mutationFn: () => purchasesApi.reconcile() });

  const run = async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      const result = await mutation.mutateAsync();
      toast.success(reconcileMessage(result));
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      // 401/403: сессию уже завершил глобальный обработчик клиента
      if (err?.status === 401 || err?.status === 403) return false;
      toast.error(err?.status === 0 ? 'Нет связи с сервером. Попробуйте ещё раз' : getErrorMessage(err?.errorCode));
      return false;
    } finally {
      inFlight.current = false;
    }
    // оплаченные покупки превращаются в начисления подборщикам, а счётчик зависших на дашборде уменьшается
    void Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.purchasesRoot }), queryClient.invalidateQueries({ queryKey: queryKeys.stats })]);
    return true;
  };

  return { run, isPending: mutation.isPending };
}
