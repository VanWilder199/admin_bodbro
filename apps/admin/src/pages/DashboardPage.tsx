import { formatByn } from '@podbor/ui/lib/format';
import { Card } from '@podbor/ui/components/card';
import { Skeleton } from '@podbor/ui/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { statsApi } from '@/api/endpoints/stats';
import { queryKeys } from '@/api/queryKeys';
import type { AdminStats } from '@/api/types';
import { LoadError } from '@/components/LoadError';

/** Счётчики перечитываются раз в минуту и после мутаций (общий корень `['stats']` инвалидируется вместе со списками). */
export const STATS_REFRESH_MS = 60_000;

interface Tile {
  key: string;
  label: string;
  value: (stats: AdminStats) => string;
  /** Куда ведёт карточка: отфильтрованный список. */
  to: string;
  /** Карточка требует внимания, когда значение положительное. */
  attention?: (stats: AdminStats) => boolean;
  hint?: (stats: AdminStats) => string | null;
}

export const TILES: Tile[] = [
  { key: 'pendingReview', label: 'На модерации', value: (s) => String(s.pendingReview), to: '/moderation', attention: (s) => s.pendingReview > 0 },
  { key: 'revisionRequired', label: 'На доработке', value: (s) => String(s.revisionRequired), to: '/reports?status=revision_required' },
  { key: 'inspectorsPending', label: 'Заявки подборщиков', value: (s) => String(s.inspectorsPending), to: '/inspectors?status=pending', attention: (s) => s.inspectorsPending > 0 },
  {
    key: 'payoutBatchesPending',
    label: 'Батчи к оплате',
    value: (s) => String(s.payoutBatchesPending),
    to: '/payouts?status=pending',
    attention: (s) => s.payoutBatchesPending > 0,
    hint: (s) => (s.payoutBatchesPending > 0 ? `на ${formatByn(s.payoutBatchesPendingAmountByn)}` : null),
  },
  { key: 'unbatchedPayoutsAmountByn', label: 'Накоплено вне батчей', value: (s) => formatByn(s.unbatchedPayoutsAmountByn), to: '/payouts' },
  { key: 'purchasesPaidLast30d', label: 'Покупки за 30 дней', value: (s) => String(s.purchasesPaidLast30d), to: '/purchases?status=paid' },
  { key: 'revenueLast30dByn', label: 'Выручка за 30 дней', value: (s) => formatByn(s.revenueLast30dByn), to: '/purchases?status=paid' },
  {
    key: 'purchasesStuckPending',
    label: 'Зависшие платежи',
    value: (s) => String(s.purchasesStuckPending),
    to: '/purchases?status=pending',
    attention: (s) => s.purchasesStuckPending > 0,
    hint: (s) => (s.purchasesStuckPending > 0 ? 'ждут подтверждения от bePaid' : null),
  },
];

function StatTile({ tile, stats }: { tile: Tile; stats: AdminStats }) {
  const attention = tile.attention?.(stats) ?? false;
  const hint = tile.hint?.(stats);
  return (
    <Link
      to={tile.to}
      data-testid={`tile-${tile.key}`}
      className="block rounded-card outline-none focus-visible:ring-4 focus-visible:ring-ring"
    >
      <Card className={`h-full space-y-1 transition hover:bg-secondary/60 ${attention ? 'ring-2 ring-warn' : ''}`}>
        <p className="text-caption text-muted-foreground">{tile.label}</p>
        <p className="text-title font-semibold">{tile.value(stats)}</p>
        {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      </Card>
    </Link>
  );
}

function TilesSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Загрузка показателей">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

/** `/`: что требует внимания. Каждая карточка ведёт на отфильтрованный список. */
export function DashboardPage() {
  const stats = useQuery({ queryKey: queryKeys.stats, queryFn: () => statsApi.get(), refetchInterval: STATS_REFRESH_MS });

  let content;
  if (stats.isPending) content = <TilesSkeleton />;
  else if (stats.isError && !stats.data) content = <LoadError error={stats.error} onRetry={() => void stats.refetch()} retrying={stats.isFetching} />;
  else if (stats.data) {
    const data = stats.data;
    content = (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <StatTile key={tile.key} tile={tile} stats={data} />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-title font-semibold">Дашборд</h1>
        <p className="text-body text-muted-foreground">Что требует внимания сейчас.</p>
      </header>
      {content}
    </div>
  );
}
