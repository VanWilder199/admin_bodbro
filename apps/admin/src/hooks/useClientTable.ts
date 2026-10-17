import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SortDirection = 'asc' | 'desc';

export interface ClientTableOptions<T> {
  /** Поля, по которым ищет строка поиска: значения приводятся к строке, `null` пропускается. */
  searchFields: (keyof T)[];
  /** Сортировка по умолчанию. Без неё порядок строк остаётся как отдал бэкенд (для очереди — старые сверху). */
  sortBy?: keyof T;
  sortDirection?: SortDirection;
  pageSize?: number;
  /** Ключи параметров URL. Меняются, если на странице несколько таблиц. */
  params?: { q?: string; page?: string; sort?: string; dir?: string };
}

export interface ClientTable<T> {
  /** Строки текущей страницы. */
  rows: T[];
  /** Все строки после поиска и сортировки, без разбиения на страницы: для итогов («сумма по вкладке»), которые не должны зависеть от страницы. */
  filteredRows: T[];
  /** Строк после поиска, до разбиения на страницы. */
  total: number;
  /** Строк всего, до поиска: отличает «пусто» от «ничего не нашлось». */
  totalUnfiltered: number;
  query: string;
  setQuery: (value: string) => void;
  /** Текущая страница, 1-based; всегда в допустимых границах. */
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  sortBy: keyof T | null;
  sortDirection: SortDirection;
  /** Клик по заголовку: сначала по возрастанию, повторный клик — по убыванию, третий — сброс. */
  toggleSort: (field: keyof T) => void;
}

export const DEFAULT_PAGE_SIZE = 25;

/** Нормализация для поиска: регистр и «ё» не мешают найти «Иван» по «иван» и «Фёдор» по «федор». */
export function normalizeSearch(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .trim();
}

function compare(a: unknown, b: unknown): number {
  // null — всегда в конец, в каком бы направлении ни шла сортировка
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'ru', { numeric: true, sensitivity: 'base' });
}

/**
 * Поиск, сортировка и пагинация на клиенте (PLAN_FRONTEND_ADMIN.md, 3.5): бэкенд отдаёт списки целиком.
 * Состояние живёт в URL (`?q=&page=&sort=&dir=`), поэтому ссылка воспроизводит вид, а «Назад» из карточки возвращает туда же.
 * Когда появится серверная пагинация (BE-4), хук заменяется запросом с `page/size/sort`, а разметка таблицы остаётся.
 */
export function useClientTable<T>(rows: T[], options: ClientTableOptions<T>): ClientTable<T> {
  const { searchFields, pageSize = DEFAULT_PAGE_SIZE, params } = options;
  const keys = { q: params?.q ?? 'q', page: params?.page ?? 'page', sort: params?.sort ?? 'sort', dir: params?.dir ?? 'dir' };
  const [searchParams, setSearchParams] = useSearchParams();

  const query = searchParams.get(keys.q) ?? '';
  const sortParam = searchParams.get(keys.sort);
  const dirParam = searchParams.get(keys.dir);

  // Поле сортировки из URL принимается, только если оно есть в данных: `?sort=<что угодно>` не должен ломать таблицу.
  const knownFields = useMemo(() => new Set<string>(rows.length > 0 ? Object.keys(rows[0] as object) : []), [rows]);
  const urlSort = sortParam && knownFields.has(sortParam) ? (sortParam as keyof T) : null;
  const sortBy = urlSort ?? options.sortBy ?? null;
  const sortDirection: SortDirection = urlSort ? (dirParam === 'desc' ? 'desc' : 'asc') : (options.sortDirection ?? 'asc');

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return rows;
    return rows.filter((row) => searchFields.some((field) => normalizeSearch(row[field]).includes(needle)));
  }, [rows, query, searchFields]);

  const sorted = useMemo(() => {
    if (sortBy === null) return filtered;
    const factor = sortDirection === 'asc' ? 1 : -1;
    // `sort` стабилен: равные элементы сохраняют порядок бэкенда
    return [...filtered].sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av == null || bv == null) return compare(av, bv); // null в конец независимо от направления
      return compare(av, bv) * factor;
    });
  }, [filtered, sortBy, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const requestedPage = Number.parseInt(searchParams.get(keys.page) ?? '1', 10);
  // Страница за границами (список сократился, ссылка устарела) прижимается к допустимой, а не показывает пустоту
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), pageCount) : 1;

  const pageRows = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);

  const update = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      // replace: набор букв в поиске не должен засорять историю — иначе «Назад» из карточки пришлось бы нажимать десять раз
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          mutate(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setQuery = useCallback(
    (value: string) =>
      update((next) => {
        if (value) next.set(keys.q, value);
        else next.delete(keys.q);
        next.delete(keys.page); // новый поиск — с первой страницы
      }),
    [update, keys.q, keys.page],
  );

  const setPage = useCallback(
    (value: number) =>
      update((next) => {
        if (value <= 1) next.delete(keys.page);
        else next.set(keys.page, String(value));
      }),
    [update, keys.page],
  );

  const toggleSort = useCallback(
    (field: keyof T) =>
      update((next) => {
        const name = String(field);
        const isCurrent = sortBy !== null && String(sortBy) === name;

        if (!isCurrent) {
          next.set(keys.sort, name);
          next.set(keys.dir, 'asc');
        } else if (!urlSort) {
          // Колонка уже отсортирована по умолчанию (в URL ничего нет): первый клик переворачивает направление,
          // а не «включает» то, что и так видно, — иначе казалось бы, что клик не сработал
          next.set(keys.sort, name);
          next.set(keys.dir, sortDirection === 'asc' ? 'desc' : 'asc');
        } else if (sortDirection === 'asc') {
          next.set(keys.dir, 'desc');
        } else {
          next.delete(keys.sort); // третий клик — сброс к порядку по умолчанию
          next.delete(keys.dir);
        }
        next.delete(keys.page);
      }),
    [update, keys.sort, keys.dir, keys.page, sortBy, sortDirection, urlSort],
  );

  return {
    rows: pageRows,
    filteredRows: sorted,
    total: sorted.length,
    totalUnfiltered: rows.length,
    query,
    setQuery,
    page,
    pageCount,
    setPage,
    sortBy,
    sortDirection,
    toggleSort,
  };
}
