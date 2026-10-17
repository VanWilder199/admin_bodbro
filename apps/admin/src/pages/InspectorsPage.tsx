import { CardGroup } from '@podbor/ui/components/card';
import { Cell, CellIcon } from '@podbor/ui/components/cell';
import { Badge } from '@podbor/ui/components/ui/badge';
import { Button } from '@podbor/ui/components/ui/button';
import { Skeleton } from '@podbor/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@podbor/ui/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@podbor/ui/components/ui/tabs';
import { formatPhone } from '@podbor/ui/lib/format';
import { useQuery } from '@tanstack/react-query';
import { Ban, BadgeCheck, SearchX, UserRound, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { inspectorsApi } from '@/api/endpoints/inspectors';
import { queryKeys } from '@/api/queryKeys';
import type { InspectorDto, InspectorStatus } from '@/api/types';
import { EmptyState } from '@/components/EmptyState';
import { LoadError } from '@/components/LoadError';
import { Pagination, SearchBox } from '@/components/ListControls';
import { SortableHead } from '@/components/SortableHead';
import { useClientTable, type ClientTable } from '@/hooks/useClientTable';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { BanDialog, VerifyDialog } from '@/features/inspectors/InspectorDialogs';
import { useInspectorActions } from '@/features/inspectors/useInspectorActions';

/** Вкладки статуса. `all` — без параметра `?status=` на бэкенд. */
export type InspectorTab = InspectorStatus | 'all';

export const INSPECTOR_TABS: { value: InspectorTab; label: string }[] = [
  { value: 'pending', label: 'Ожидают' },
  { value: 'verified', label: 'Верифицированы' },
  { value: 'banned', label: 'Забанены' },
  { value: 'all', label: 'Все' },
];

export const DEFAULT_TAB: InspectorTab = 'pending';

const STATUS_LABELS: Record<InspectorStatus, string> = { pending: 'Ожидает', verified: 'Верифицирован', banned: 'Забанен' };
const STATUS_TONES = { pending: 'warn', verified: 'ok', banned: 'bad' } as const;

const EMPTY_TITLES: Record<InspectorTab, string> = {
  pending: 'Новых заявок нет',
  verified: 'Верифицированных подборщиков пока нет',
  banned: 'Забаненных подборщиков нет',
  all: 'Подборщиков пока нет',
};

/**
 * Строка таблицы: подборщик плюс поле для поиска. Телефон на экране показан как «+375 29 100-01-05», а в данных он слитный,
 * поэтому искать нужно и по тому, и по другому — админ вводит то, что видит.
 */
export type InspectorRow = InspectorDto & { searchText: string };

const SEARCH_FIELDS: (keyof InspectorRow)[] = ['fullName', 'email', 'searchText'];

export function toRow(inspector: InspectorDto): InspectorRow {
  return { ...inspector, searchText: `${inspector.phone} ${formatPhone(inspector.phone)}` };
}

/** `?status=` из адреса → вкладка. Незнакомое значение — вкладка по умолчанию, а не пустой экран. */
export function tabFromParam(value: string | null): InspectorTab {
  return INSPECTOR_TABS.some((tab) => tab.value === value) ? (value as InspectorTab) : DEFAULT_TAB;
}

/** Параметр для бэкенда: «Все» — без фильтра. */
const statusFilter = (tab: InspectorTab): InspectorStatus | undefined => (tab === 'all' ? undefined : tab);

type PendingAction = { kind: 'verify' | 'ban'; inspector: InspectorDto } | null;

function StatusBadge({ status }: { status: InspectorStatus }) {
  return <Badge tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

/** Кнопки по состоянию: «Верифицировать» — только у pending, «Забанить» — у всех, кроме banned. Бэкенд перепроверит. */
function RowActions({ inspector, onAction }: { inspector: InspectorDto; onAction: (kind: 'verify' | 'ban', inspector: InspectorDto) => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {inspector.status === 'pending' && (
        <Button size="sm" onClick={() => onAction('verify', inspector)} aria-label={`Верифицировать ${inspector.fullName}`}>
          <BadgeCheck aria-hidden />
          Верифицировать
        </Button>
      )}
      {inspector.status !== 'banned' && (
        <Button size="sm" variant="secondary" className="text-destructive" onClick={() => onAction('ban', inspector)} aria-label={`Забанить ${inspector.fullName}`}>
          <Ban aria-hidden />
          Забанить
        </Button>
      )}
    </div>
  );
}

function InspectorsTable({ table, onAction }: { table: ClientTable<InspectorRow>; onAction: (kind: 'verify' | 'ban', inspector: InspectorDto) => void }) {
  return (
    <div className="rounded-card bg-card p-2">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead table={table} field="fullName">
              ФИО
            </SortableHead>
            <SortableHead table={table} field="phone">
              Телефон
            </SortableHead>
            <SortableHead table={table} field="email">
              Email
            </SortableHead>
            <SortableHead table={table} field="telegramUserId">
              Telegram
            </SortableHead>
            <SortableHead table={table} field="status">
              Статус
            </SortableHead>
            <th className="w-px px-3" aria-label="Действия" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((inspector) => (
            <TableRow key={inspector.id}>
              <TableCell className="font-semibold">{inspector.fullName}</TableCell>
              <TableCell className="whitespace-nowrap">
                <a href={`tel:${inspector.phone}`} className="underline-offset-4 hover:underline">
                  {formatPhone(inspector.phone)}
                </a>
              </TableCell>
              <TableCell>
                <a href={`mailto:${inspector.email}`} className="break-all underline-offset-4 hover:underline">
                  {inspector.email}
                </a>
              </TableCell>
              <TableCell className="font-mono text-caption">
                <a href={`tg://user?id=${inspector.telegramUserId}`} className="underline-offset-4 hover:underline" title="Открыть в Telegram">
                  {inspector.telegramUserId}
                </a>
              </TableCell>
              <TableCell>
                <StatusBadge status={inspector.status} />
              </TableCell>
              <TableCell>
                <RowActions inspector={inspector} onAction={onAction} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** На телефоне — список ячеек: действия под ФИО, контакты в подзаголовке. */
function InspectorsList({ table, onAction }: { table: ClientTable<InspectorRow>; onAction: (kind: 'verify' | 'ban', inspector: InspectorDto) => void }) {
  return (
    <div className="space-y-3">
      {table.rows.map((inspector) => (
        <div key={inspector.id} className="overflow-hidden rounded-card bg-card">
          <CardGroup>
            <Cell
              before={
                <CellIcon>
                  <UserRound />
                </CellIcon>
              }
              title={inspector.fullName}
              subtitle={`${formatPhone(inspector.phone)} · ${inspector.email}`}
              after={<StatusBadge status={inspector.status} />}
            />
          </CardGroup>
          {inspector.status !== 'banned' && (
            <div className="px-4 pb-4">
              <RowActions inspector={inspector} onAction={onAction} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2 rounded-card bg-card p-4" aria-busy="true" aria-label="Загрузка подборщиков">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** `/inspectors?status=&q=&page=`: заявки на верификацию, верифицированные и забаненные подборщики. */
export function InspectorsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromParam(searchParams.get('status'));

  const inspectors = useQuery({
    queryKey: queryKeys.inspectors(statusFilter(tab)),
    queryFn: () => inspectorsApi.list(statusFilter(tab)),
  });

  const rows = useMemo(() => (inspectors.data ?? []).map(toRow), [inspectors.data]);
  // Бэкенд порядок не гарантирует (нет ORDER BY): по умолчанию сортируем по ФИО
  const table = useClientTable(rows, { searchFields: SEARCH_FIELDS, sortBy: 'fullName' });
  const isMobile = useIsMobile();
  const { run, isPending } = useInspectorActions();
  const [action, setAction] = useState<PendingAction>(null);

  const selectTab = (next: string) =>
    // Смена вкладки сбрасывает страницу и сортировку, а поиск остаётся: «Иван» ищут и среди ожидающих, и среди всех
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set('status', next);
      params.delete('page');
      return params;
    });

  const closeAction = (open: boolean) => !open && setAction(null);

  let content;
  if (inspectors.isPending) {
    content = <ListSkeleton />;
  } else if (inspectors.isError && !inspectors.data) {
    content = <LoadError error={inspectors.error} onRetry={() => void inspectors.refetch()} retrying={inspectors.isFetching} />;
  } else if (table.totalUnfiltered === 0) {
    content = <EmptyState icon={<Users />} title={EMPTY_TITLES[tab]} />;
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
        {isMobile ? <InspectorsList table={table} onAction={(kind, inspector) => setAction({ kind, inspector })} /> : <InspectorsTable table={table} onAction={(kind, inspector) => setAction({ kind, inspector })} />}
        <Pagination page={table.page} pageCount={table.pageCount} total={table.total} onPage={table.setPage} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-title font-semibold">Подборщики</h1>
          <p className="text-body text-muted-foreground">Верификация новых заявок и блокировка недобросовестных.</p>
        </div>
        <SearchBox value={table.query} onChange={table.setQuery} placeholder="ФИО, телефон или email" label="Поиск по подборщикам" />
      </header>

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList aria-label="Статус подборщика">
          {INSPECTOR_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {content}

      {action?.kind === 'verify' && (
        <VerifyDialog
          inspector={action.inspector}
          open
          onOpenChange={closeAction}
          busy={isPending}
          onConfirm={async () => {
            const result = await run('verify', action.inspector);
            if (result.kind === 'done' || result.kind === 'conflict') setAction(null);
          }}
        />
      )}
      {action?.kind === 'ban' && <BanDialog inspector={action.inspector} open onOpenChange={closeAction} busy={isPending} onSubmit={(reason) => run('ban', action.inspector, reason)} />}
    </div>
  );
}
