import { CardGroup } from '@podbor/ui/components/card';
import { Cell, CellIcon } from '@podbor/ui/components/cell';
import { Badge } from '@podbor/ui/components/ui/badge';
import { Button } from '@podbor/ui/components/ui/button';
import { Skeleton } from '@podbor/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@podbor/ui/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@podbor/ui/components/ui/tabs';
import { formatByn } from '@podbor/ui/lib/format';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, HandCoins, SearchX, Wallet } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { payoutsApi } from '@/api/endpoints/payouts';
import { queryKeys } from '@/api/queryKeys';
import type { PayoutBatch, PayoutStatus } from '@/api/types';
import { EmptyState } from '@/components/EmptyState';
import { LoadError } from '@/components/LoadError';
import { Pagination, SearchBox } from '@/components/ListControls';
import { SortableHead } from '@/components/SortableHead';
import { features } from '@/features/flags';
import { BatchItems, UnbatchedBlock } from '@/features/payouts/BatchTools';
import { PayDialog } from '@/features/payouts/PayDialog';
import { formatPeriod, formatStamp, totalKopecks } from '@/features/payouts/format';
import { usePayBatch } from '@/features/payouts/usePayBatch';
import { useClientTable, type ClientTable } from '@/hooks/useClientTable';
import { useIsMobile } from '@/hooks/useMediaQuery';

/** Вкладки статуса. `all` — без параметра `?status=` на бэкенд. */
export type PayoutTab = PayoutStatus | 'all';

export const PAYOUT_TABS: { value: PayoutTab; label: string }[] = [
  { value: 'pending', label: 'К оплате' },
  { value: 'paid', label: 'Оплачено' },
  { value: 'all', label: 'Все' },
];

export const DEFAULT_TAB: PayoutTab = 'pending';

/** `?status=` из адреса → вкладка. Незнакомое значение — вкладка по умолчанию, а не пустой экран. */
export function tabFromParam(value: string | null): PayoutTab {
  return PAYOUT_TABS.some((tab) => tab.value === value) ? (value as PayoutTab) : DEFAULT_TAB;
}

const statusFilter = (tab: PayoutTab): PayoutStatus | undefined => (tab === 'all' ? undefined : tab);

const STATUS_LABELS: Record<PayoutStatus, string> = { pending: 'К оплате', paid: 'Оплачен' };
const STATUS_TONES = { pending: 'warn', paid: 'ok' } as const;

/**
 * Строка таблицы: батч плюс поле для поиска и готовая подпись периода (по ней сортируется и ищется то,
 * что админ видит на экране, а не сырые даты с миллисекундами).
 */
export type PayoutRow = PayoutBatch & { periodLabel: string; searchText: string };

const SEARCH_FIELDS: (keyof PayoutRow)[] = ['inspectorName', 'inspectorEmail', 'periodLabel'];

export function toRow(batch: PayoutBatch): PayoutRow {
  const periodLabel = formatPeriod(batch.periodStart, batch.periodEnd);
  return { ...batch, periodLabel, searchText: periodLabel };
}

const EMPTY: Record<PayoutTab, { title: string; hint?: string }> = {
  pending: { title: 'Нет батчей к оплате', hint: 'Батчи создаются автоматически 1-го числа каждого месяца.' },
  paid: { title: 'Оплаченных батчей пока нет' },
  all: { title: 'Батчей пока нет', hint: 'Батчи создаются автоматически 1-го числа каждого месяца.' },
};

function PayButton({ batch, onPay }: { batch: PayoutBatch; onPay: (batch: PayoutBatch) => void }) {
  if (batch.status !== 'pending') return null;
  return (
    <Button size="sm" onClick={() => onPay(batch)} aria-label={`Отметить оплаченным: ${batch.inspectorName}, ${batch.periodStart.slice(0, 7)}`}>
      <HandCoins aria-hidden />
      Отметить оплаченным
    </Button>
  );
}

/** Кнопка раскрытия состава батча. Есть только при `features.batchTools`: без BE-8 эндпоинта `GET /admin/payouts/{id}` нет. */
function ExpandButton({ batch, expanded, onToggle }: { batch: PayoutBatch; expanded: boolean; onToggle: (uuid: string) => void }) {
  if (!features.batchTools) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-expanded={expanded}
      aria-label={`${expanded ? 'Скрыть' : 'Показать'} состав: ${batch.inspectorName}, ${batch.periodStart.slice(0, 7)}`}
      onClick={() => onToggle(batch.uuid)}
    >
      <ChevronDown className={expanded ? 'rotate-180' : undefined} aria-hidden />
      Состав
    </Button>
  );
}

function PayoutsTable({ table, onPay, expandedId, onToggle }: { table: ClientTable<PayoutRow>; onPay: (batch: PayoutBatch) => void; expandedId: string | null; onToggle: (uuid: string) => void }) {
  return (
    <div className="rounded-card bg-card p-2">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead table={table} field="inspectorName">
              Подборщик
            </SortableHead>
            <SortableHead table={table} field="periodStart">
              Период
            </SortableHead>
            <SortableHead table={table} field="amountByn">
              Сумма
            </SortableHead>
            <SortableHead table={table} field="createdAt">
              Создан
            </SortableHead>
            <SortableHead table={table} field="paidAt">
              Оплачен
            </SortableHead>
            <th className="w-px px-3" aria-label="Действия" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((batch) => (
            <Fragment key={batch.uuid}>
              <TableRow>
                <TableCell>
                  <p className="font-semibold">{batch.inspectorName}</p>
                  <a href={`mailto:${batch.inspectorEmail}`} className="text-caption break-all text-muted-foreground underline-offset-4 hover:underline">
                    {batch.inspectorEmail}
                  </a>
                </TableCell>
                <TableCell className="whitespace-nowrap capitalize">{batch.periodLabel}</TableCell>
                <TableCell className="font-semibold whitespace-nowrap">{formatByn(batch.amountByn)}</TableCell>
                <TableCell className="text-caption whitespace-nowrap text-muted-foreground">{formatStamp(batch.createdAt)}</TableCell>
                <TableCell className="text-caption whitespace-nowrap text-muted-foreground">{formatStamp(batch.paidAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    {batch.status === 'paid' && <Badge tone="ok">{STATUS_LABELS.paid}</Badge>}
                    <ExpandButton batch={batch} expanded={expandedId === batch.uuid} onToggle={onToggle} />
                    <PayButton batch={batch} onPay={onPay} />
                  </div>
                </TableCell>
              </TableRow>
              {expandedId === batch.uuid && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6}>
                    <BatchItems batch={batch} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PayoutsList({ table, onPay, expandedId, onToggle }: { table: ClientTable<PayoutRow>; onPay: (batch: PayoutBatch) => void; expandedId: string | null; onToggle: (uuid: string) => void }) {
  return (
    <div className="space-y-3">
      {table.rows.map((batch) => (
        <div key={batch.uuid} className="overflow-hidden rounded-card bg-card">
          <CardGroup>
            <Cell
              before={
                <CellIcon tone={batch.status === 'paid' ? 'ok' : 'warn'}>
                  <Wallet />
                </CellIcon>
              }
              title={batch.inspectorName}
              subtitle={`${batch.periodLabel} · ${batch.inspectorEmail}`}
              after={
                <>
                  <span className="text-body font-semibold text-foreground">{formatByn(batch.amountByn)}</span>
                  <Badge tone={STATUS_TONES[batch.status]}>{STATUS_LABELS[batch.status]}</Badge>
                </>
              }
            />
          </CardGroup>
          {(batch.status === 'pending' || features.batchTools) && (
            <div className="flex flex-wrap gap-2 px-4 pb-4">
              <ExpandButton batch={batch} expanded={expandedId === batch.uuid} onToggle={onToggle} />
              <PayButton batch={batch} onPay={onPay} />
            </div>
          )}
          {expandedId === batch.uuid && (
            <div className="px-4 pb-4">
              <BatchItems batch={batch} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 rounded-card bg-card p-4" aria-busy="true" aria-label="Загрузка выплат">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** `/payouts?status=&q=&page=`: батчи выплат подборщикам, оплата отмечается вручную после перевода вне системы. */
export function PayoutsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromParam(searchParams.get('status'));

  const payouts = useQuery({
    queryKey: queryKeys.payouts(statusFilter(tab)),
    queryFn: () => payoutsApi.list(statusFilter(tab)),
  });

  const rows = useMemo(() => (payouts.data ?? []).map(toRow), [payouts.data]);
  // Бэкенд отдаёт `created_at DESC`: без явной сортировки оставляем его порядок — свежие батчи сверху
  const table = useClientTable(rows, { searchFields: SEARCH_FIELDS });
  const isMobile = useIsMobile();
  const { run, isPending } = usePayBatch();
  const [paying, setPaying] = useState<PayoutBatch | null>(null);
  // Раскрыт один батч за раз: состав каждого — отдельный запрос, десяток открытых строк только мешал бы
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = (uuid: string) => setExpandedId((current) => (current === uuid ? null : uuid));

  const selectTab = (next: string) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('status', next);
      params.delete('page');
      return params;
    });

  // Итог считается по всем найденным строкам, а не по текущей странице: «сумма по вкладке и по фильтру»
  const total = totalKopecks(table.filteredRows);

  let content;
  if (payouts.isPending) {
    content = <ListSkeleton />;
  } else if (payouts.isError && !payouts.data) {
    content = <LoadError error={payouts.error} onRetry={() => void payouts.refetch()} retrying={payouts.isFetching} />;
  } else if (table.totalUnfiltered === 0) {
    content = <EmptyState icon={<Wallet />} title={EMPTY[tab].title} hint={EMPTY[tab].hint} />;
  } else if (table.total === 0) {
    content = (
      <EmptyState
        icon={<SearchX />}
        title={`Ничего не найдено по «${table.query}»`}
        hint={
          <Button variant="ghost" size="sm" onClick={() => table.setQuery('')}>
            Сбросить поиск
          </Button>
        }
      />
    );
  } else {
    content = (
      <div className="space-y-3">
        {isMobile ? (
          <PayoutsList table={table} onPay={setPaying} expandedId={expandedId} onToggle={toggleExpanded} />
        ) : (
          <PayoutsTable table={table} onPay={setPaying} expandedId={expandedId} onToggle={toggleExpanded} />
        )}
        <Pagination page={table.page} pageCount={table.pageCount} total={table.total} onPage={table.setPage} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title font-semibold">Выплаты</h1>
          <p className="text-body text-muted-foreground">Деньги переводятся вне системы — здесь отмечается факт оплаты.</p>
        </div>
        <SearchBox value={table.query} onChange={table.setQuery} placeholder="Подборщик, email или месяц" label="Поиск по выплатам" />
      </header>

      {features.batchTools && <UnbatchedBlock />}

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList aria-label="Статус выплаты">
          {PAYOUT_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {table.total > 0 && (
        <p className="px-1 text-body" data-testid="payouts-total">
          <span className="text-muted-foreground">
            {table.query ? 'Итого по фильтру' : 'Итого'} ({table.total}):{' '}
          </span>
          <span className="font-semibold">{formatByn(total)}</span>
        </p>
      )}

      {content}

      {paying && (
        <PayDialog
          batch={paying}
          open
          onOpenChange={(open) => !open && setPaying(null)}
          busy={isPending}
          onConfirm={async () => {
            const result = await run(paying);
            if (result.kind === 'done' || result.kind === 'conflict') setPaying(null);
          }}
        />
      )}
    </div>
  );
}
