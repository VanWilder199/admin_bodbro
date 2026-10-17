import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { normalizeSearch, useClientTable, type ClientTableOptions } from './useClientTable';

interface Row {
  id: number;
  name: string | null;
  city: string;
  age: number | null;
}

const ROWS: Row[] = [
  { id: 1, name: 'Иван Петров', city: 'Минск', age: 30 },
  { id: 2, name: 'Фёдор Сидоров', city: 'Брест', age: null },
  { id: 3, name: null, city: 'Гомель', age: 25 },
  { id: 4, name: 'анна иванова', city: 'Минск', age: 41 },
];

function setup(rows: Row[] = ROWS, options: Partial<ClientTableOptions<Row>> = {}, url = '/') {
  const location = { current: '' };
  const Probe = () => {
    const { pathname, search } = useLocation();
    location.current = pathname + search;
    return null;
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <Probe />
      {children}
    </MemoryRouter>
  );
  const hook = renderHook(() => useClientTable(rows, { searchFields: ['name', 'city'], ...options }), { wrapper });
  return { ...hook, location };
}

const ids = (rows: Row[]) => rows.map((r) => r.id);

describe('поиск', () => {
  it('без запроса — все строки в порядке бэкенда', () => {
    const { result } = setup();
    expect(ids(result.current.rows)).toEqual([1, 2, 3, 4]);
    expect(result.current.total).toBe(4);
  });

  it('ищет подстроку без учёта регистра по нескольким полям', () => {
    const { result } = setup(ROWS, {}, '/?q=минск');
    expect(ids(result.current.rows)).toEqual([1, 4]);
  });

  it('«ё» и «е» не различаются', () => {
    expect(ids(setup(ROWS, {}, '/?q=федор').result.current.rows)).toEqual([2]);
    expect(ids(setup(ROWS, {}, '/?q=фёдор').result.current.rows)).toEqual([2]);
  });

  it('null в поле поиска не ломает фильтр и не находится по слову «null»', () => {
    const { result } = setup(ROWS, {}, '/?q=null');
    expect(result.current.rows).toEqual([]);
  });

  it('totalUnfiltered отличает «пусто» от «ничего не нашлось»', () => {
    const { result } = setup(ROWS, {}, '/?q=нет-такого');
    expect(result.current.total).toBe(0);
    expect(result.current.totalUnfiltered).toBe(4);
  });

  it('setQuery пишет q в URL, не засоряя историю (replace), и сбрасывает страницу', () => {
    const { result, location } = setup(ROWS, { pageSize: 2 }, '/?page=2');
    expect(result.current.page).toBe(2);
    act(() => result.current.setQuery('минск'));
    expect(location.current).toBe('/?q=%D0%BC%D0%B8%D0%BD%D1%81%D0%BA');
    expect(result.current.page).toBe(1);
  });

  it('пустой запрос убирает q из URL', () => {
    const { result, location } = setup(ROWS, {}, '/?q=минск');
    act(() => result.current.setQuery(''));
    expect(location.current).toBe('/');
  });

  it('другие параметры URL (например, status) не теряются', () => {
    const { result, location } = setup(ROWS, {}, '/?status=pending');
    act(() => result.current.setQuery('иван'));
    expect(location.current).toContain('status=pending');
    expect(location.current).toContain('q=');
  });
});

describe('сортировка', () => {
  it('клик: по возрастанию → по убыванию → сброс к порядку бэкенда', () => {
    const { result, location } = setup();
    act(() => result.current.toggleSort('city'));
    expect(result.current.sortDirection).toBe('asc');
    expect(ids(result.current.rows)).toEqual([2, 3, 1, 4]); // Брест, Гомель, Минск, Минск (стабильно)

    act(() => result.current.toggleSort('city'));
    expect(result.current.sortDirection).toBe('desc');
    expect(ids(result.current.rows)).toEqual([1, 4, 3, 2]);

    act(() => result.current.toggleSort('city'));
    expect(result.current.sortBy).toBeNull();
    expect(ids(result.current.rows)).toEqual([1, 2, 3, 4]);
    expect(location.current).toBe('/');
  });

  it('null всегда в конце — и по возрастанию, и по убыванию', () => {
    const { result } = setup();
    act(() => result.current.toggleSort('age'));
    expect(ids(result.current.rows)).toEqual([3, 1, 4, 2]);
    act(() => result.current.toggleSort('age'));
    expect(ids(result.current.rows)).toEqual([4, 1, 3, 2]);
  });

  it('числа сортируются как числа, а не как строки', () => {
    const rows: Row[] = [
      { id: 1, name: 'a', city: 'x', age: 9 },
      { id: 2, name: 'b', city: 'x', age: 10 },
    ];
    const { result } = setup(rows);
    act(() => result.current.toggleSort('age'));
    expect(ids(result.current.rows)).toEqual([1, 2]);
  });

  it('сортировка по умолчанию задаётся опциями', () => {
    const { result } = setup(ROWS, { sortBy: 'id', sortDirection: 'desc' });
    expect(ids(result.current.rows)).toEqual([4, 3, 2, 1]);
  });

  it('поле сортировки из URL, которого нет в данных, игнорируется', () => {
    const { result } = setup(ROWS, {}, '/?sort=drop-table&dir=desc');
    expect(result.current.sortBy).toBeNull();
    expect(ids(result.current.rows)).toEqual([1, 2, 3, 4]);
  });

  it('сортировка восстанавливается из URL', () => {
    const { result } = setup(ROWS, {}, '/?sort=city&dir=desc');
    expect(result.current.sortBy).toBe('city');
    expect(result.current.sortDirection).toBe('desc');
  });
});

describe('пагинация', () => {
  const many: Row[] = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `n${i}`, city: 'c', age: i }));

  it('режет на страницы по pageSize', () => {
    const { result } = setup(many, { pageSize: 3 });
    expect(result.current.pageCount).toBe(3);
    expect(ids(result.current.rows)).toEqual([1, 2, 3]);
  });

  it('страница берётся из URL, setPage пишет её обратно, первая страница в URL не пишется', () => {
    const { result, location } = setup(many, { pageSize: 3 }, '/?page=3');
    expect(ids(result.current.rows)).toEqual([7]);
    act(() => result.current.setPage(1));
    expect(location.current).toBe('/');
    act(() => result.current.setPage(2));
    expect(location.current).toBe('/?page=2');
  });

  it.each(['99', '0', '-5', 'abc'])('некорректная страница %s прижимается к допустимой', (page) => {
    const { result } = setup(many, { pageSize: 3 }, `/?page=${page}`);
    expect(result.current.page).toBeGreaterThanOrEqual(1);
    expect(result.current.page).toBeLessThanOrEqual(3);
    expect(result.current.rows.length).toBeGreaterThan(0);
  });

  it('пустой список — одна пустая страница, а не «страница 1 из 0»', () => {
    const { result } = setup([], { pageSize: 3 });
    expect(result.current.pageCount).toBe(1);
    expect(result.current.rows).toEqual([]);
  });

  it('по умолчанию 25 строк на странице', () => {
    const big: Row[] = Array.from({ length: 60 }, (_, i) => ({ id: i, name: 'n', city: 'c', age: i }));
    expect(setup(big).result.current.rows).toHaveLength(25);
    expect(setup(big).result.current.pageCount).toBe(3);
  });
});

describe('несколько таблиц на странице', () => {
  it('ключи параметров URL переопределяются, и таблицы не мешают друг другу', () => {
    const { result } = setup(ROWS, { params: { q: 'pq' } }, '/?q=минск&pq=иван');
    expect(result.current.query).toBe('иван');
    expect(ids(result.current.rows)).toEqual([1, 4]);
  });
});

describe('normalizeSearch', () => {
  it('приводит регистр и «ё», обрезает пробелы, терпит null', () => {
    expect(normalizeSearch('  ЁЖ ')).toBe('еж');
    expect(normalizeSearch(null)).toBe('');
    expect(normalizeSearch(undefined)).toBe('');
    expect(normalizeSearch(42)).toBe('42');
  });
});
