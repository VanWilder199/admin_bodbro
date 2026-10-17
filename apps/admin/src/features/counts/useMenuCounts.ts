import { useQuery, type QueryClient } from '@tanstack/react-query';
import { inspectorsApi } from '@/api/endpoints/inspectors';
import { moderationApi } from '@/api/endpoints/moderation';
import { payoutsApi } from '@/api/endpoints/payouts';
import { queryKeys } from '@/api/queryKeys';

/** Счётчики в меню обновляются раз в минуту (в фоновой вкладке TanStack Query сам приостанавливает опрос). */
export const COUNTS_REFRESH_MS = 60_000;

export interface MenuCounts {
  moderation: number | undefined;
  inspectors: number | undefined;
  payouts: number | undefined;
}

/**
 * Три счётчика: очередь модерации, подборщики `pending`, выплаты `pending`.
 * `undefined` — данных ещё нет или запрос упал: меню в этом случае просто не показывает число и остаётся рабочим.
 * Ключи общие со списками, поэтому на экране очереди это тот же запрос, а не второй.
 */
export function useMenuCounts(): MenuCounts {
  const length = <T,>(items: T[]) => items.length;
  const options = { refetchInterval: COUNTS_REFRESH_MS, select: length } as const;

  const moderation = useQuery({ queryKey: queryKeys.moderationQueue, queryFn: () => moderationApi.queue(), ...options });
  const inspectors = useQuery({ queryKey: queryKeys.inspectors('pending'), queryFn: () => inspectorsApi.list('pending'), ...options });
  const payouts = useQuery({ queryKey: queryKeys.payouts('pending'), queryFn: () => payoutsApi.list('pending'), ...options });

  return { moderation: moderation.data, inspectors: inspectors.data, payouts: payouts.data };
}

/** Вызывать после мутаций (одобрить, вернуть, удалить, верифицировать, забанить, оплатить): счётчики и списки перечитаются. */
export function invalidateMenuCounts(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.moderationQueue }),
    queryClient.invalidateQueries({ queryKey: queryKeys.inspectorsRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.payoutsRoot }),
    // счётчики дашборда и реестр отчётов зависят от тех же решений (одобрить, удалить, оплатить…)
    queryClient.invalidateQueries({ queryKey: queryKeys.stats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.reportsRegistry }),
  ]);
}
