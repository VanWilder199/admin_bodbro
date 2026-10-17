import { CardGroup } from '@podbor/ui/components/card';
import { Cell, CellIcon } from '@podbor/ui/components/cell';
import { formatPrice } from '@podbor/ui';
import { Badge } from '@podbor/ui/components/ui/badge';
import { Button } from '@podbor/ui/components/ui/button';
import { Skeleton } from '@podbor/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@podbor/ui/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, FileSearch, ImageOff } from 'lucide-react';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { moderationApi } from '@/api/endpoints/moderation';
import { queryKeys } from '@/api/queryKeys';
import type { InspectorStatus, ModerationQueueItem } from '@/api/types';
import { EmptyState } from '@/components/EmptyState';
import { LoadError } from '@/components/LoadError';
import { Pagination, SearchBox } from '@/components/ListControls';
import { SortableHead } from '@/components/SortableHead';
import { useClientTable, type ClientTable } from '@/hooks/useClientTable';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { formatCarTitle, formatDateTime, formatRelativeTime } from '@/lib/format';

/** Очередь перечитывается раз в минуту и при возврате на вкладку (`refetchOnWindowFocus` по умолчанию). */
export const QUEUE_REFRESH_MS = 60_000;

/** Строка таблицы: данные бэкенда плюс вычисленное название машины, по которому можно сортировать. */
interface QueueRow {
  reportId: string;
  carTitle: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  inspectorName: string;
  inspectorStatus: InspectorStatus;
  priceByn: number;
  resubmitted: boolean;
  submittedAt: string;
}

const SEARCH_FIELDS: (keyof QueueRow)[] = ['vin', 'make', 'model', 'inspectorName'];

/** Подпись при неверифицированном подборщике: у верифицированного предупреждать не о чем. */
const INSPECTOR_WARNINGS: Partial<Record<InspectorStatus, string>> = { pending: 'не верифицирован', banned: 'заблокирован' };

function toRow(item: ModerationQueueItem): QueueRow {
  return {
    reportId: item.reportId,
    carTitle: formatCarTitle(item),
    vin: item.vin,
    make: item.make,
    model: item.model,
    inspectorName: item.inspectorName,
    inspectorStatus: item.inspectorStatus,
    priceByn: item.priceByn,
    resubmitted: item.resubmitted,
    submittedAt: item.submittedAt,
  };
}

/** Текущее время для подписей «N минут назад»: обновляется раз в минуту, чтобы подписи не застывали на открытой странице. */
function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const reportPath = (row: QueueRow) => `/reports/${row.reportId}`;

/** Предупреждение прямо в очереди: отчёт неверифицированного подборщика требует внимания. */
function InspectorWarning({ status }: { status: InspectorStatus }) {
  const text = INSPECTOR_WARNINGS[status];
  if (!text) return null;
  return (
    <p className="flex items-center gap-1 text-caption font-semibold text-warn">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

function QueueTable({ table, now }: { table: ClientTable<QueueRow>; now: number }) {
  const navigate = useNavigate();

  // Строка кликабельна целиком, но ссылка внутри неё обрабатывает свой клик сама — иначе переход случился бы дважды
  const open = (row: QueueRow, event: { target: EventTarget }) => {
    if ((event.target as HTMLElement).closest('a')) return;
    navigate(reportPath(row));
  };
  const onKeyDown = (row: QueueRow, event: KeyboardEvent) => {
    if (event.key === 'Enter' && event.target === event.currentTarget) navigate(reportPath(row));
  };

  return (
    <div className="rounded-card bg-card p-2">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead table={table} field="carTitle">
              Машина
            </SortableHead>
            <SortableHead table={table} field="vin">
              VIN
            </SortableHead>
            <SortableHead table={table} field="inspectorName">
              Подборщик
            </SortableHead>
            <SortableHead table={table} field="priceByn">
              Цена
            </SortableHead>
            <SortableHead table={table} field="submittedAt">
              В очереди с
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => (
            <TableRow key={row.reportId} className="cursor-pointer" tabIndex={0} onClick={(e) => open(row, e)} onKeyDown={(e) => onKeyDown(row, e)}>
              <TableCell>
                <Link to={reportPath(row)} className="font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline">
                  {row.carTitle}
                </Link>
                {row.resubmitted && (
                  <Badge tone="warn" className="ml-2 align-middle">
                    Повторно
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-mono text-caption select-all">{row.vin ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>
                <p>{row.inspectorName}</p>
                <InspectorWarning status={row.inspectorStatus} />
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatPrice(row.priceByn)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <time dateTime={row.submittedAt} title={formatDateTime(row.submittedAt)}>
                  {formatRelativeTime(row.submittedAt, now)}
                </time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** На телефоне вместо таблицы — список ячеек: вся строка ведёт в карточку отчёта. */
function QueueList({ table, now }: { table: ClientTable<QueueRow>; now: number }) {
  return (
    <CardGroup>
      {table.rows.map((row) => (
        <Cell
          key={row.reportId}
          asChild
          before={
            <CellIcon>
              <FileSearch />
            </CellIcon>
          }
          title={row.carTitle}
          subtitle={[
            row.vin ?? 'VIN не указан',
            `${row.inspectorName}${INSPECTOR_WARNINGS[row.inspectorStatus] ? ` (${INSPECTOR_WARNINGS[row.inspectorStatus]})` : ''}`,
            formatPrice(row.priceByn),
          ].join(' · ')}
          after={
            <>
              {row.resubmitted && <Badge tone="warn">Повторно</Badge>}
              <span className="text-caption text-muted-foreground">{formatRelativeTime(row.submittedAt, now)}</span>
            </>
          }
          chevron
        >
          <Link to={reportPath(row)} />
        </Cell>
      ))}
    </CardGroup>
  );
}

function QueueSkeleton() {
  return (
    <div className="space-y-2 rounded-card bg-card p-4" aria-busy="true" aria-label="Загрузка очереди">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** `/moderation`: отчёты на модерации от старых к новым (порядок бэкенда), поиск и сортировка на клиенте. */
export function ModerationQueuePage() {
  const queue = useQuery({
    queryKey: queryKeys.moderationQueue,
    queryFn: () => moderationApi.queue(),
    refetchInterval: QUEUE_REFRESH_MS,
  });

  const rows = useMemo(() => (queue.data ?? []).map(toRow), [queue.data]);
  const table = useClientTable(rows, { searchFields: SEARCH_FIELDS });
  const isMobile = useIsMobile();
  const now = useNow();

  let content;
  if (queue.isPending) {
    content = <QueueSkeleton />;
  } else if (queue.isError && !queue.data) {
    // Если данные уже были, фоновая ошибка обновления не прячет их: показываем старый список
    content = <LoadError error={queue.error} onRetry={() => void queue.refetch()} retrying={queue.isFetching} />;
  } else if (table.totalUnfiltered === 0) {
    content = <EmptyState icon={<CircleCheck />} title="Очередь пуста — все отчёты разобраны" hint="Новые отчёты появятся здесь, как только подборщики отправят их на проверку." />;
  } else if (table.total === 0) {
    content = (
      <EmptyState
        icon={<ImageOff />}
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
        {isMobile ? <QueueList table={table} now={now} /> : <QueueTable table={table} now={now} />}
        <Pagination page={table.page} pageCount={table.pageCount} total={table.total} onPage={table.setPage} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title font-semibold">Модерация</h1>
          <p className="text-body text-muted-foreground">Отчёты, ожидающие решения: старые сверху.</p>
        </div>
        <SearchBox value={table.query} onChange={table.setQuery} placeholder="VIN, марка, модель или подборщик" label="Поиск по очереди" />
      </header>
      {content}
    </div>
  );
}
