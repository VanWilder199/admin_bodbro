import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';
import { moderationApi } from '@/api/endpoints/moderation';
import { getErrorMessage } from '@/api/errorMessages';
import { queryKeys } from '@/api/queryKeys';
import type { ModerationQueueItem } from '@/api/types';
import { pickNextReportId } from './nextInQueue';

export type ModerationAction = 'approve' | 'revise' | 'delete';

/**
 * Чем кончилась попытка:
 *  done        — бэкенд ответил 200, диалог можно закрывать;
 *  conflict    — состояние изменилось где-то ещё (409/404): тост показан, данные перечитаны, диалог закрывать;
 *  field-error — 400 с ошибкой по полю причины: диалог остаётся открытым, текст сохраняется;
 *  failed      — сеть, 5xx или конец сессии: диалог остаётся открытым, можно повторить;
 *  busy        — предыдущий запрос ещё идёт, этот клик проигнорирован (защита от двойного нажатия).
 */
export type RunResult = { kind: 'done' } | { kind: 'conflict' } | { kind: 'field-error'; message: string } | { kind: 'failed' } | { kind: 'busy' };

/** Эти ответы значат «состояние изменилось»: в другой вкладке или после двойного клика (PLAN_FRONTEND_ADMIN.md, 3.3). */
const CONFLICT_CODES = new Set(['REPORT_NOT_PENDING_REVIEW', 'REPORT_ALREADY_DELETED', 'REPORT_NOT_FOUND']);

const SUCCESS_MESSAGES: Record<ModerationAction, string> = {
  approve: 'Опубликовано',
  revise: 'Возвращено на доработку',
  delete: 'Отчёт удалён',
};

/**
 * Решения модератора. Только пессимистично (PLAN_FRONTEND_ADMIN.md, 3.3): письма уходят сразу, откатить показанное
 * «одобрено» нельзя, поэтому интерфейс меняется только после ответа 200.
 */
export function useModerationActions(reportId: string) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // `isPending` обновится только после рендера, а второй клик может прийти раньше — поэтому ещё и флаг в ref
  const inFlight = useRef(false);

  const mutation = useMutation({
    mutationFn: ({ action, reasonText }: { action: ModerationAction; reasonText: string }) => {
      switch (action) {
        case 'approve':
          return moderationApi.approve(reportId);
        case 'revise':
          return moderationApi.revise(reportId, { reasonText });
        case 'delete':
          return moderationApi.delete(reportId, { reasonText });
      }
    },
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.report(reportId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.moderationQueue }),
      // решение меняет и реестр отчётов, и счётчики дашборда
      queryClient.invalidateQueries({ queryKey: queryKeys.reportsRegistry }),
      queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
    ]);

  /** Очередь до решения и после него: по первой понятно, где стоял отчёт, по второй — что ещё осталось. */
  const findNext = async (before: ModerationQueueItem[]): Promise<string | null> => {
    let after = before;
    try {
      // staleTime: 0 — нужна правда с сервера, а не кеш в 30 секунд
      after = await queryClient.fetchQuery({ queryKey: queryKeys.moderationQueue, queryFn: () => moderationApi.queue(), staleTime: 0 });
    } catch {
      // не вышло перечитать — работаем по тому, что было, без отчёта, который только что разобрали
    }
    return pickNextReportId(
      before.map((item) => item.reportId),
      after.map((item) => item.reportId),
      reportId,
    );
  };

  const onSuccess = async (action: ModerationAction) => {
    toast.success(SUCCESS_MESSAGES[action]);

    // Удалённый остаётся на экране: админ видит баннер «Удалён» и причину (приёмка ADM-8)
    if (action === 'delete') {
      void refresh();
      return;
    }

    const before = queryClient.getQueryData<ModerationQueueItem[]>(queryKeys.moderationQueue) ?? [];
    const nextId = await findNext(before);
    // Разобранный отчёт сразу уходит из кеша очереди, чтобы список и счётчик в меню не показывали его до перезапроса
    queryClient.setQueryData<ModerationQueueItem[]>(queryKeys.moderationQueue, (old) => old?.filter((item) => item.reportId !== reportId));
    void refresh();
    navigate(nextId ? `/reports/${nextId}` : '/moderation');
  };

  const run = async (action: ModerationAction, reasonText = ''): Promise<RunResult> => {
    if (inFlight.current) return { kind: 'busy' };
    inFlight.current = true;

    try {
      await mutation.mutateAsync({ action, reasonText });
    } catch (e) {
      const err = e instanceof ApiError ? e : null;

      if (err?.errorCode && CONFLICT_CODES.has(err.errorCode)) {
        // Не красная ошибка: письмо либо ушло, либо нет, а картина мира просто устарела
        toast.warning(getErrorMessage(err.errorCode));
        void refresh();
        return { kind: 'conflict' };
      }

      const reasonError = err?.fieldErrors?.reasonText;
      if (err?.status === 400 && reasonError) return { kind: 'field-error', message: reasonError };

      // 401/403: сессию уже завершил глобальный обработчик клиента, а редирект на /login сделает RequireAuth
      if (err?.status === 401 || err?.status === 403) return { kind: 'failed' };

      toast.error(err?.status === 0 ? 'Нет связи с сервером. Попробуйте ещё раз' : getErrorMessage(err?.errorCode));
      return { kind: 'failed' };
    } finally {
      inFlight.current = false;
    }

    await onSuccess(action);
    return { kind: 'done' };
  };

  return { run, isPending: mutation.isPending };
}
