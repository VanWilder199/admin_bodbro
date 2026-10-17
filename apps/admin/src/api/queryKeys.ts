/**
 * Ключи кэша TanStack Query. Список и счётчик в меню читают один и тот же ключ, поэтому запрос не дублируется,
 * а инвалидация после мутации обновляет оба места сразу.
 */
export const queryKeys = {
  me: ['me'] as const,
  moderationQueue: ['moderation', 'queue'] as const,
  report: (id: string) => ['moderation', 'report', id] as const,
  /** Реестр всех отчётов (ADM-13). */
  reportsRegistry: ['moderation', 'registry'] as const,
  /** Корень для инвалидации всех списков подборщиков. */
  inspectorsRoot: ['inspectors'] as const,
  inspectors: (status?: string) => ['inspectors', status ?? 'all'] as const,
  payoutsRoot: ['payouts'] as const,
  payouts: (status?: string) => ['payouts', status ?? 'all'] as const,
  /** Состав батча и накопления лежат под тем же корнем, что и списки: оплата и формирование батчей обновляют всё разом. */
  payoutBatch: (uuid: string) => ['payouts', 'batch', uuid] as const,
  payoutsUnbatched: ['payouts', 'unbatched'] as const,
  /** Корень для всех списков и карточек покупок (ADM-15). */
  purchasesRoot: ['purchases'] as const,
  purchases: (status?: string) => ['purchases', 'list', status ?? 'all'] as const,
  purchase: (id: string) => ['purchases', 'detail', id] as const,
  stats: ['stats'] as const,
};
