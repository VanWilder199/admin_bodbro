/**
 * Какой отчёт открыть после решения по текущему.
 *  - `before` — очередь до решения (по ней видно, где стоял текущий отчёт);
 *  - `after` — свежая очередь с сервера (по ней видно, что ещё можно разбирать).
 * Берётся первый отчёт ПОСЛЕ текущего, который ещё в очереди; если таких нет — самый старый из оставшихся.
 * Очередь пуста — `null`.
 */
export function pickNextReportId(before: string[], after: string[], currentId: string): string | null {
  const remaining = new Set(after.filter((id) => id !== currentId));
  if (remaining.size === 0) return null;

  const index = before.indexOf(currentId);
  if (index !== -1) {
    const next = before.slice(index + 1).find((id) => remaining.has(id));
    if (next) return next;
  }
  return after.find((id) => remaining.has(id)) ?? null;
}
