import { Button } from '@podbor/ui/components/ui/button';
import { Card } from '@podbor/ui/components/card';
import { Skeleton } from '@podbor/ui/components/ui/skeleton';
import { formatByn } from '@podbor/ui/lib/format';
import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { payoutsApi } from '@/api/endpoints/payouts';
import { queryKeys } from '@/api/queryKeys';
import type { PayoutBatch } from '@/api/types';
import { LoadError } from '@/components/LoadError';
import { ConfirmDialog } from '@/features/moderation/dialogs';
import { formatStamp, totalKopecks } from './format';
import { useRunBatches } from './useRunBatches';

/** Блок «Накоплено вне батчей» и кнопка «Сформировать батчи сейчас» (ADM-16, BE-8). */
export function UnbatchedBlock() {
  const unbatched = useQuery({ queryKey: queryKeys.payoutsUnbatched, queryFn: () => payoutsApi.unbatched() });
  const { run, isPending } = useRunBatches();
  const [confirming, setConfirming] = useState(false);

  const items = unbatched.data ?? [];
  const total = totalKopecks(items);
  const count = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className="space-y-3" data-testid="unbatched-block">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-heading font-semibold">Накоплено вне батчей</h2>
          <p className="text-caption text-muted-foreground">Начисления подборщикам, которые ещё не вошли в выплату. Автоматически батчи создаются 1-го числа.</p>
        </div>
        <Button onClick={() => setConfirming(true)} loading={isPending} disabled={items.length === 0}>
          <Layers aria-hidden />
          Сформировать батчи сейчас
        </Button>
      </div>

      {unbatched.isPending && <Skeleton className="h-10 w-full" aria-busy="true" aria-label="Загрузка накоплений" />}
      {unbatched.isError && !unbatched.data && <LoadError error={unbatched.error} onRetry={() => void unbatched.refetch()} retrying={unbatched.isFetching} />}
      {unbatched.data && items.length === 0 && <p className="text-body text-muted-foreground">Всё накопленное уже в батчах.</p>}
      {items.length > 0 && (
        <>
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.inspectorId} className="flex items-center justify-between gap-3 py-2">
                <span className="font-semibold">{item.inspectorName}</span>
                <span className="text-body">
                  <span className="text-muted-foreground">{item.count} шт. · </span>
                  <span className="font-semibold">{formatByn(item.amountByn)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-body">
            <span className="text-muted-foreground">Всего ({count}): </span>
            <span className="font-semibold">{formatByn(total)}</span>
          </p>
        </>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Сформировать батчи сейчас?"
        description={`Накопления (${formatByn(total)}) превратятся в батчи «К оплате» по подборщикам. Отменить это нельзя.`}
        confirmLabel="Сформировать"
        busy={isPending}
        onConfirm={async () => {
          await run();
          setConfirming(false);
        }}
      />
    </Card>
  );
}

/** Состав батча: покупки, из которых набрана сумма. Сумма позиций совпадает с суммой батча. */
export function BatchItems({ batch }: { batch: PayoutBatch }) {
  const detail = useQuery({ queryKey: queryKeys.payoutBatch(batch.uuid), queryFn: () => payoutsApi.get(batch.uuid) });

  if (detail.isPending) return <Skeleton className="h-16 w-full" aria-busy="true" aria-label="Загрузка состава батча" />;
  if (detail.isError || !detail.data) return <LoadError error={detail.error} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />;

  const { items } = detail.data;
  const sum = totalKopecks(items);
  return (
    <div className="space-y-2" data-testid="batch-items">
      {items.length === 0 ? (
        <p className="text-body text-muted-foreground">В батче нет позиций.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li key={item.purchaseId} className="flex items-center justify-between gap-3 py-1.5 text-body">
              <span className="min-w-0">
                <Link to={`/reports/${item.reportId}`} className="font-mono text-caption underline-offset-4 hover:underline" title={item.reportId}>
                  отчёт {item.reportId.slice(-6)}
                </Link>
                <span className="ml-2 text-caption text-muted-foreground">{formatStamp(item.createdAt)}</span>
              </span>
              <span className="font-semibold whitespace-nowrap">{formatByn(item.amountByn)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-muted-foreground" data-testid="batch-items-sum">
        Сумма позиций: {formatByn(sum)}
        {sum !== batch.amountByn && <span className="ml-2 font-semibold text-bad">не совпадает с суммой батча ({formatByn(batch.amountByn)})</span>}
      </p>
    </div>
  );
}
