import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import type { InspectorDto } from '@/api/types';

/**
 * Положить свежий `InspectorDto` из ответа verify/ban во все закешированные списки подборщиков
 * (`['inspectors', 'all' | 'pending' | 'verified' | 'banned']`, PLAN_FRONTEND_ADMIN.md, 3.3):
 *  - в списке «Все» запись заменяется;
 *  - в списке своего нового статуса заменяется, если она там была;
 *  - из списков чужого статуса убирается: верифицированный сразу исчезает с вкладки «Ожидают», а счётчик в меню уменьшается.
 * Появление записи в списке нового статуса, который ещё не открывали, оставлено перезапросу (`invalidate`), а не угадыванию.
 */
export function applyInspectorUpdate(queryClient: QueryClient, updated: InspectorDto): void {
  for (const [key, list] of queryClient.getQueriesData<InspectorDto[]>({ queryKey: queryKeys.inspectorsRoot })) {
    if (!list) continue;
    const listStatus = key[1];
    const belongs = listStatus === 'all' || listStatus === updated.status;

    if (!belongs) {
      queryClient.setQueryData<InspectorDto[]>(key, list.filter((item) => item.id !== updated.id));
    } else if (list.some((item) => item.id === updated.id)) {
      queryClient.setQueryData<InspectorDto[]>(key, list.map((item) => (item.id === updated.id ? updated : item)));
    }
  }
}
