import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { purchasesApi } from '@/api/endpoints/purchases';
import { getErrorMessage } from '@/api/errorMessages';
import { queryKeys } from '@/api/queryKeys';
import type { RunResult } from '@/features/moderation/useModerationActions';

/** Состояние изменилось где-то ещё: покупки уже нет, либо она не оплачена. Не красная ошибка, а устаревшая картина мира. */
const CONFLICT_CODES = new Set(['PURCHASE_NOT_FOUND', 'PURCHASE_NOT_PAID']);

/**
 * Отозвать ссылку на отчёт у покупки. Пессимистично, как и остальные необратимые действия: отозванную ссылку
 * вернуть нельзя (перевыпуск — второй этап), поэтому интерфейс меняется только после ответа 200.
 */
export function useRevokeAccess() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mutation = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => purchasesApi.revokeAccess(id, { reason }) });

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.purchasesRoot }), queryClient.invalidateQueries({ queryKey: queryKeys.reportsRegistry })]);

  const run = async (purchaseId: string, reason: string): Promise<RunResult> => {
    if (inFlight.current) return { kind: 'busy' };
    inFlight.current = true;

    try {
      await mutation.mutateAsync({ id: purchaseId, reason });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;

      if (err?.errorCode && CONFLICT_CODES.has(err.errorCode)) {
        toast.warning(getErrorMessage(err.errorCode));
        void refresh();
        return { kind: 'conflict' };
      }

      const reasonError = err?.fieldErrors?.reason;
      if (err?.status === 400 && reasonError) return { kind: 'field-error', message: reasonError };

      // 401/403: сессию уже завершил глобальный обработчик клиента, а редирект на /login сделает RequireAuth
      if (err?.status === 401 || err?.status === 403) return { kind: 'failed' };

      toast.error(err?.status === 0 ? 'Нет связи с сервером. Попробуйте ещё раз' : getErrorMessage(err?.errorCode));
      return { kind: 'failed' };
    } finally {
      inFlight.current = false;
    }

    void refresh();
    toast.success('Ссылка отозвана');
    return { kind: 'done' };
  };

  return { run, isPending: mutation.isPending };
}
