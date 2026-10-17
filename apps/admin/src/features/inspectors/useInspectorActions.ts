import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { inspectorsApi } from '@/api/endpoints/inspectors';
import { getErrorMessage } from '@/api/errorMessages';
import { queryKeys } from '@/api/queryKeys';
import type { InspectorDto } from '@/api/types';
import type { RunResult } from '@/features/moderation/useModerationActions';
import { applyInspectorUpdate } from './cache';

export type InspectorAction = 'verify' | 'ban';

/** Состояние изменилось где-то ещё: в другой вкладке или после двойного клика (PLAN_FRONTEND_ADMIN.md, 3.3). */
const CONFLICT_CODES = new Set(['INSPECTOR_NOT_PENDING', 'INSPECTOR_ALREADY_BANNED', 'INSPECTOR_NOT_FOUND']);

const SUCCESS_MESSAGES: Record<InspectorAction, (name: string) => string> = {
  verify: (name) => `${name} верифицирован`,
  ban: (name) => `${name} заблокирован`,
};

/**
 * Верификация и бан. Как и решения по отчётам — только пессимистично: подборщику уходит письмо, показанное «верифицирован»
 * не откатить. Ответ бэкенда содержит свежий `InspectorDto`, его кладём прямо в кеш списков.
 */
export function useInspectorActions() {
  const queryClient = useQueryClient();
  // `isPending` обновится только после рендера, а второй клик может прийти раньше — поэтому ещё и флаг в ref
  const inFlight = useRef(false);

  const mutation = useMutation({
    mutationFn: ({ action, inspector, reason }: { action: InspectorAction; inspector: InspectorDto; reason: string }) =>
      action === 'verify' ? inspectorsApi.verify(inspector.id) : inspectorsApi.ban(inspector.id, { reason }),
  });

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.inspectorsRoot }), queryClient.invalidateQueries({ queryKey: queryKeys.stats })]);

  const run = async (action: InspectorAction, inspector: InspectorDto, reason = ''): Promise<RunResult> => {
    if (inFlight.current) return { kind: 'busy' };
    inFlight.current = true;

    let updated: InspectorDto;
    try {
      updated = await mutation.mutateAsync({ action, inspector, reason });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;

      if (err?.errorCode && CONFLICT_CODES.has(err.errorCode)) {
        // Не красная ошибка: статус подборщика уже изменили, картина мира просто устарела
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

    applyInspectorUpdate(queryClient, updated);
    void refresh();
    toast.success(SUCCESS_MESSAGES[action](inspector.fullName));
    return { kind: 'done' };
  };

  return { run, isPending: mutation.isPending };
}
