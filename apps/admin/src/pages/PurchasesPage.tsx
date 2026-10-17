import { CardGroup } from '@podbor/ui/components/card';
import { Cell, CellIcon } from '@podbor/ui/components/cell';
import { Badge } from '@podbor/ui/components/ui/badge';
import { Button } from '@podbor/ui/components/ui/button';
import { Skeleton } from '@podbor/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@podbor/ui/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@podbor/ui/components/ui/tabs';
import { formatByn } from '@podbor/ui/lib/format';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, SearchX, ShoppingCart } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { purchasesApi } from '@/api/endpoints/purchases';
import { queryKeys } from '@/api/queryKeys';
import type { AdminPurchase, PurchaseStatus } from '@/api/types';
import { ConfirmDialog } from '@/features/moderation/dialogs';
import { EmptyState } from '@/components/EmptyState';
import { Pagination, SearchBox } from '@/components/ListControls';
import { LoadError } from '@/components/LoadError';
import { SortableHead } from '@/components/SortableHead';
import { features } from '@/features/flags';
import { ACCESS_LABELS, accessState, buyerLabel, PURCHASE_STATUS_LABELS, PURCHASE_STATUS_TONES, PURCHASE_TABS, tabFromParam, type PurchaseTab } from '@/features/purchases/purchase';
import { PurchaseDetail } from '@/features/purchases/PurchaseDetail';
import { useReconcile } from '@/features/purchases/useReconcile';
import { useClientTable, type ClientTable } from '@/hooks/useClientTable';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { formatDateTime } from '@/lib/format';
import { useState } from 'react';

const statusFilter = (tab: PurchaseTab): PurchaseStatus | undefined => (tab === 'all' ? undefined : tab);

/** Строка таблицы: покупка плюс готовые подписи, по которым ищет и сортирует клиент. */
export type PurchaseRow = AdminPurchase & { buyer: string };

const SEARCH_FIELDS: (keyof PurchaseRow)[] = ['buyer', 'carTitle', 'buyerEmail', 'buyerPhone'];

export function toRow(purchase: AdminPurchase): PurchaseRow {
  return { ...purchase, buyer: buyerLabel(purchase) };
}

function AccessBadge({ purchase }: { purchase: AdminPurchase }) {
  const access = accessState(purchase);
  if (access === 'none') return <span className="text-muted-foreground">—</span>;
  return <Badge tone={access === 'active' ? 'ok' : 'bad'}>{ACCESS_LABELS[access]}</Badge>;
}

function PurchasesTable({ table, onOpen }: { table: ClientTable<PurchaseRow>; onOpen: (id: string) => void }) {
  return (
    <div className="rounded-card bg-card p-2">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead table={table} field="buyer">
              Покупатель
            </SortableHead>
            <SortableHead table={table} field="carTitle">
              Отчёт
            </SortableHead>
            <SortableHead table={table} field="amountByn">
              Сумма
            </SortableHead>
            <SortableHead table={table} field="status">
              Статус
            </SortableHead>
            <TableHead>Ссылка</TableHead>
            <SortableHead table={table} field="createdAt">
              Создана
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((purchase) => (
            <TableRow key={purchase.id} className="cursor-pointer" tabIndex={0} onClick={() => onOpen(purchase.id)} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onOpen(purchase.id)}>
              <TableCell className="font-semibold break-all">{purchase.buyer}</TableCell>
              <TableCell>{purchase.carTitle}</TableCell>
              <TableCell className="whitespace-nowrap">{formatByn(purchase.amountByn)}</TableCell>
              <TableCell>
                <Badge tone={PURCHASE_STATUS_TONES[purchase.status]}>{PURCHASE_STATUS_LABELS[purchase.status]}</Badge>
              </TableCell>
              <TableCell>
                <AccessBadge purchase={purchase} />
              </TableCell>
              <TableCell className="text-caption whitespace-nowrap text-muted-foreground">
                <time dateTime={purchase.createdAt}>{formatDateTime(purchase.createdAt)}</time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PurchasesList({ table, onOpen }: { table: ClientTable<PurchaseRow>; onOpen: (id: string) => void }) {
  return (
    <CardGroup>
      {table.rows.map((purchase) => (
        <Cell
          key={purchase.id}
          asChild
          before={
            <CellIcon tone={PURCHASE_STATUS_TONES[purchase.status]}>
              <ShoppingCart />
            </CellIcon>
          }
          title={purchase.buyer}
          subtitle={`${purchase.carTitle} · ${formatByn(purchase.amountByn)}`}
          after={<Badge tone={PURCHASE_STATUS_TONES[purchase.status]}>{PURCHASE_STATUS_LABELS[purchase.status]}</Badge>}
          chevron
        >
          <button type="button" onClick={() => onOpen(purchase.id)} />
        </Cell>
      ))}
    </CardGroup>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 rounded-card bg-card p-4" aria-busy="true" aria-label="Загрузка покупок">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** `/purchases?status=&q=&page=&id=`: покупки и ссылки на отчёты, чтобы отвечать на обращения покупателей. */
export function PurchasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromParam(searchParams.get('status'));
  const openId = searchParams.get('id');

  const purchases = useQuery({ queryKey: queryKeys.purchases(statusFilter(tab)), queryFn: () => purchasesApi.list(statusFilter(tab)) });

  const rows = useMemo(() => (purchases.data ?? []).map(toRow), [purchases.data]);
  // Бэкенд отдаёт свежие сверху — оставляем этот порядок, пока админ не выберет сортировку
  const table = useClientTable(rows, { searchFields: SEARCH_FIELDS });
  const isMobile = useIsMobile();
  const { run: reconcile, isPending: reconciling } = useReconcile();
  const [confirmReconcile, setConfirmReconcile] = useState(false);

  const setParam = (name: string, value: string | null) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (value === null) params.delete(name);
      else params.set(name, value);
      if (name !== 'id') params.delete('page');
      return params;
    });

  // Карточка покупки адресуется через `?id=`: ссылка открывает её, «Назад» закрывает
  const open = (id: string) => setParam('id', id);

  let content;
  if (purchases.isPending) {
    content = <ListSkeleton />;
  } else if (purchases.isError && !purchases.data) {
    content = <LoadError error={purchases.error} onRetry={() => void purchases.refetch()} retrying={purchases.isFetching} />;
  } else if (table.totalUnfiltered === 0) {
    content = <EmptyState icon={<ShoppingCart />} title="Покупок пока нет" />;
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
        {isMobile ? <PurchasesList table={table} onOpen={open} /> : <PurchasesTable table={table} onOpen={open} />}
        <Pagination page={table.page} pageCount={table.pageCount} total={table.total} onPage={table.setPage} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title font-semibold">Покупки</h1>
          <p className="text-body text-muted-foreground">Кто что купил и действует ли ссылка на отчёт.</p>
        </div>
        <SearchBox value={table.query} onChange={table.setQuery} placeholder="Email, телефон или отчёт" label="Поиск по покупкам" />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(next) => setParam('status', next === 'all' ? null : next)}>
          <TabsList aria-label="Статус покупки">
            {PURCHASE_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {features.batchTools && (
          <Button variant="secondary" size="sm" onClick={() => setConfirmReconcile(true)} loading={reconciling}>
            <RefreshCw aria-hidden />
            Сверить зависшие платежи с bePaid
          </Button>
        )}
      </div>

      {content}

      {openId && <PurchaseDetail id={openId} onClose={() => setParam('id', null)} />}

      <ConfirmDialog
        open={confirmReconcile}
        onOpenChange={setConfirmReconcile}
        title="Сверить платежи с bePaid?"
        description="Зависшие платежи будут проверены в bePaid: оплаченные станут оплаченными, отклонённые — отклонёнными. Оплаченным сразу откроется доступ к отчёту."
        confirmLabel="Сверить"
        busy={reconciling}
        onConfirm={async () => {
          await reconcile();
          setConfirmReconcile(false);
        }}
      />
    </div>
  );
}
