import { useSyncExternalStore } from 'react';

/** Граница `md` в Tailwind: ниже — телефон, таблица очереди превращается в список ячеек. */
export const MOBILE_QUERY = '(max-width: 767.98px)';

function subscribe(query: string, callback: () => void) {
  const mql = window.matchMedia(query);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/**
 * `true`, пока окно уже порога. Нужен там, где таблица и список рисуются РАЗНОЙ разметкой:
 * CSS-скрытие (`hidden md:block`) оставило бы в DOM обе версии — дубли для тестов и скринридеров.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => subscribe(query, callback),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
