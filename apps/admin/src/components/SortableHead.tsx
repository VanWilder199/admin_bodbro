import { TableHead } from '@podbor/ui/components/ui/table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ClientTable } from '@/hooks/useClientTable';

/** Заголовок колонки с сортировкой по клику: возрастание → убывание → порядок бэкенда. */
export function SortableHead<T>({ table, field, children, hint }: { table: ClientTable<T>; field: keyof T; children: string; hint?: string }) {
  const active = table.sortBy === field;
  const Icon = !active ? ArrowUpDown : table.sortDirection === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (table.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} title={hint}>
      <button
        type="button"
        onClick={() => table.toggleSort(field)}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring"
      >
        {children}
        <Icon className={active ? 'size-4 text-foreground' : 'size-4 opacity-50'} aria-hidden />
      </button>
    </TableHead>
  );
}
