import { Button } from '@podbor/ui/components/ui/button';
import { Input } from '@podbor/ui/components/ui/input';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

const DEBOUNCE_MS = 200;

/**
 * Поле поиска. Текст в поле обновляется сразу, а в URL (`onChange`) уходит с небольшой задержкой:
 * иначе каждая буква перерисовывала бы таблицу и дёргала адресную строку.
 */
export function SearchBox({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  const [text, setText] = useState(value);

  // Значение изменилось снаружи (кнопка «Назад», ссылка с ?q=) — показываем его
  useEffect(() => setText(value), [value]);

  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onChange(text), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);

  return (
    <div className="relative w-full md:max-w-sm">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" aria-label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} className="h-11 pl-11" />
    </div>
  );
}

export function Pagination({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Страницы" className="flex items-center justify-between gap-3 px-1">
      <p className="text-caption text-muted-foreground">
        Страница {page} из {pageCount} · всего {total}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden />
          Назад
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Вперёд
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
