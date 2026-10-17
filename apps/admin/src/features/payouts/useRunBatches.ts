import { formatByn } from '@podbor/ui/lib/format';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { payoutsApi } from '@/api/endpoints/payouts';
import { getErrorMessage } from '@/api/errorMessages';
import { queryKeys } from '@/api/queryKeys';
import type { RunBatchesResult } from '@/api/types';

export function runBatchesMessage(result: RunBatchesResult): string {
  if (result.batchesCreated === 0) return 'Нечего формировать: накоплений нет';
  return `Создано батчей: ${result.batchesCreated} на ${formatByn(result.totalAmountByn)}`;
}

/**
 * Сформировать батчи сейчас. Только пессимистично: после 200 накопления превращаются в батчи, и откатить это нельзя.
 * Двойной клик не отправляет второй запрос: на настоящем бэкенде параллельный запуск без блокировки создал бы дубли (BE-8).
 */
export function useRunBatches() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mutation = useMutation({ mutationFn: () => payoutsApi.runBatches() });

  const run = async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      const result = await mutation.mutateAsync();
      toast.success(runBatchesMessage(result));
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      // 401/403: сессию уже завершил глобальный обработчик клиента
      if (err?.status === 401 || err?.status === 403) return false;
      toast.error(err?.status === 0 ? 'Нет связи с сервером. Попробуйте ещё раз' : getErrorMessage(err?.errorCode));
      return false;
    } finally {
      inFlight.current = false;
    }
    // новые батчи появятся в «К оплате», блок «Накоплено» опустеет, счётчик в меню и дашборд обновятся
    void Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.payoutsRoot }), queryClient.invalidateQueries({ queryKey: queryKeys.stats })]);
    return true;
  };

  return { run, isPending: mutation.isPending };
}
