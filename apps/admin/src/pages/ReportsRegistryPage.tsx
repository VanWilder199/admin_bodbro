import { formatPrice } from '@podbor/ui';
import { CardGroup } from '@podbor/ui/components/card';
import { Cell, CellIcon } from '@podbor/ui/components/cell';
import { Badge } from '@podbor/ui/components/ui/badge';
import { Button } from '@podbor/ui/components/ui/button';
import { Skeleton } from '@podbor/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@podbor/ui/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@podbor/ui/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { FileText, SearchX, X } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { moderationApi } from '@/api/endpoints/moderation';
import { queryKeys } from '@/api/queryKeys';
import type { ReportListItem, ReportStatus } from '@/api/types';
import { EmptyState } from '@/components/EmptyState';
import { Pagination, SearchBox } from '@/components/ListControls';
import { LoadError } from '@/components/LoadError';
import { SortableHead } from '@/components/SortableHead';
import { REPORT_STATUS_LABELS, REPORT_STATUS_TONES } from '@/features/report/history';
import { useClientTable, type ClientTable } from '@/hooks/useClientTable';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { formatCarTitle, formatDateTime } from '@/lib/format';

/** Фильтр по статусу. `all` — без фильтра. */
export type StatusTab = ReportStatus | 'all';

export const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending_review', label: 'На модерации' },
  { value: 'revision_required', label: 'На доработке' },
  { value: 'published', label: 'Опубликованы' },
  { value: 'draft', label: 'Черновики' },
];

/** Удалённые: по умолчанию скрыты (как `deleted=false` в плане), можно показать только их или все. */
export type DeletedFilter = 'hide' | 'only' | 'any';

export const DELETED_TABS: { value: DeletedFilter; label: string }[] = [
  { value: 'hide', label: 'Без удалённых' },
  { value: 'only', label: 'Только удалённые' },
  { value: 'any', label: 'С удалёнными' },
];

/** Неизвестное значение в адресе — фильтр сброшен, а не пустой список (приёмка ADM-13). */
export function statusFromParam(value: string | null): StatusTab {
  return STATUS_TABS.some((tab) => tab.value === value) ? (value as StatusTab) : 'all';
}

export function deletedFromParam(value: string | null): DeletedFilter {
  return DELETED_TABS.some((tab) => tab.value === value) ? (value as DeletedFilter) : 'hide';
}

/** Строка таблицы: отчёт плюс готовое название машины, по которому можно искать и сортировать. */
export type RegistryRow = ReportListItem & { carTitle: string };

const SEARCH_FIELDS: (keyof RegistryRow)[] = ['vin', 'make', 'model', 'carTitle', 'inspectorName'];

export function toRow(item: ReportListItem): RegistryRow {
  return { ...item, carTitle: formatCarTitle(item) };
}

export interface RegistryFilters {
  status: StatusTab;
  deleted: DeletedFilter;
  inspectorId: string | null;
  carId: string | null;
}

/** Фильтры на клиенте: все отчёты уже загружены одним запросом, повторных запросов смена фильтра не вызывает. */
export function applyFilters(rows: RegistryRow[], filters: RegistryFilters): RegistryRow[] {
  return rows.filter((row) => {
    if (filters.status !== 'all' && row.status !== filters.status) return false;
    if (filters.deleted === 'hide' && row.deletedAt) return false;
    if (filters.deleted === 'only' && !row.deletedAt) return false;
    if (filters.inspectorId && row.inspectorId !== filters.inspectorId) return false;
    if (filters.carId && row.carId !== filters.carId) return false;
    return true;
  });
}

function StatusBadge({ row }: { row: RegistryRow }) {
  if (row.deletedAt) return <Badge tone="bad">Удалён</Badge>;
  return <Badge tone={REPORT_STATUS_TONES[row.status]}>{REPORT_STATUS_LABELS[row.status]}</Badge>;
}

const reportPath = (row: RegistryRow) => `/reports/${row.reportId}`;

function RegistryTable({ table }: { table: ClientTable<RegistryRow> }) {
  const navigate = useNavigate();
  const open = (row: RegistryRow, event: { target: EventTarget }) => {
    if ((event.target as HTMLElement).closest('a')) return;
    navigate(reportPath(row));
  };

  return (
    <div className="rounded-card bg-card p-2">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead table={table} field="carTitle">
              Машина
            </SortableHead>
            <SortableHead table={table} field="status">
              Статус
            </SortableHead>
            <SortableHead table={table} field="inspectorName">
              Подборщик
            </SortableHead>
            <SortableHead table={table} field="priceByn">
              Цена
            </SortableHead>
            <SortableHead table={table} field="paidPurchasesCount">
              Покупок
            </SortableHead>
            <SortableHead table={table} field="createdAt">
              Создан
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => (
            <TableRow key={row.reportId} className="cursor-pointer" tabIndex={0} onClick={(e) => open(row, e)} onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(reportPath(row))}>
              <TableCell>
                <Link to={reportPath(row)} className="font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline">
                  {row.carTitle}
                </Link>
                <p className="font-mono text-caption text-muted-foreground select-all">{row.vin ?? '—'}</p>
              </TableCell>
              <TableCell>
                <StatusBadge row={row} />
              </TableCell>
              <TableCell>{row.inspectorName}</TableCell>
              <TableCell className="whitespace-nowrap">{formatPrice(row.priceByn)}</TableCell>
              <TableCell>{row.paidPurchasesCount}</TableCell>
              <TableCell className="text-caption whitespace-nowrap text-muted-foreground">
                <time dateTime={row.createdAt}>{formatDateTime(row.createdAt)}</time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RegistryList({ table }: { table: ClientTable<RegistryRow> }) {
  return (
    <CardGroup>
      {table.rows.map((row) => (
        <Cell
          key={row.reportId}
          asChild
          before={
            <CellIcon>
              <FileText />
            </CellIcon>
          }
          title={row.carTitle}
          subtitle={`${row.inspectorName} · ${formatPrice(row.priceByn)}`}
          after={<StatusBadge row={row} />}
          chevron
        >
          <Link to={reportPath(row)} />
        </Cell>
      ))}
    </CardGroup>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 rounded-card bg-card p-4" aria-busy="true" aria-label="Загрузка отчётов">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Подборщик или машина, по которым открыт реестр (переход из их карточек). Сброс — крестик. */
function ActiveFilter({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary py-1 pr-1 pl-3 text-caption font-semibold">
      {label}
      <Button variant="ghost" size="icon" className="size-6" aria-label={`Сбросить фильтр: ${label}`} onClick={onClear}>
        <X className="size-4" aria-hidden />
      </Button>
    </span>
  );
}

/** `/reports?status=&deleted=&inspectorId=&carId=&q=&page=`: любой отчёт, в том числе опубликованный и удалённый. */
export function ReportsRegistryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = statusFromParam(searchParams.get('status'));
  const deleted = deletedFromParam(searchParams.get('deleted'));
  const inspectorId = searchParams.get('inspectorId');
  const carId = searchParams.get('carId');

  const reports = useQuery({ queryKey: queryKeys.reportsRegistry, queryFn: () => moderationApi.list() });

  const allRows = useMemo(() => (reports.data ?? []).map(toRow), [reports.data]);
  const rows = useMemo(() => applyFilters(allRows, { status, deleted, inspectorId, carId }), [allRows, status, deleted, inspectorId, carId]);
  // Свежие сверху — порядок бэкенда `created_at DESC`; сортировка по колонкам включается кликом
  const table = useClientTable(rows, { searchFields: SEARCH_FIELDS });
  const isMobile = useIsMobile();

  const setParam = (name: string, value: string | null) =>
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (value === null) params.delete(name);
      else params.set(name, value);
      params.delete('page');
      return params;
    });

  const inspectorName = inspectorId ? allRows.find((r) => r.inspectorId === inspectorId)?.inspectorName : undefined;
  const carName = carId ? allRows.find((r) => r.carId === carId)?.carTitle : undefined;

  let content;
  if (reports.isPending) {
    content = <ListSkeleton />;
  } else if (reports.isError && !reports.data) {
    content = <LoadError error={reports.error} onRetry={() => void reports.refetch()} retrying={reports.isFetching} />;
  } else if (allRows.length === 0) {
    content = <EmptyState icon={<FileText />} title="Отчётов пока нет" />;
  } else if (table.total === 0) {
    content = (
      <EmptyState
        icon={<SearchX />}
        title={table.query ? `Ничего не найдено по «${table.query}»` : 'Нет отчётов с такими фильтрами'}
        hint={
          table.query ? (
            <Button variant="ghost" size="sm" onClick={() => table.setQuery('')}>
              Сбросить поиск
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    content = (
      <div className="space-y-3">
        {isMobile ? <RegistryList table={table} /> : <RegistryTable table={table} />}
        <Pagination page={table.page} pageCount={table.pageCount} total={table.total} onPage={table.setPage} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title font-semibold">Отчёты</h1>
          <p className="text-body text-muted-foreground">Все отчёты: опубликованные, на доработке и удалённые.</p>
        </div>
        <SearchBox value={table.query} onChange={table.setQuery} placeholder="VIN, марка, модель или подборщик" label="Поиск по отчётам" />
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={(next) => setParam('status', next === 'all' ? null : next)}>
          <TabsList aria-label="Статус отчёта">
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={deleted} onValueChange={(next) => setParam('deleted', next === 'hide' ? null : next)}>
          <TabsList aria-label="Удалённые отчёты">
            {DELETED_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {(inspectorId || carId) && (
        <div className="flex flex-wrap gap-2">
          {inspectorId && <ActiveFilter label={`Подборщик: ${inspectorName ?? inspectorId}`} onClear={() => setParam('inspectorId', null)} />}
          {carId && <ActiveFilter label={`Машина: ${carName ?? carId}`} onClear={() => setParam('carId', null)} />}
        </div>
      )}

      {content}
    </div>
  );
}
