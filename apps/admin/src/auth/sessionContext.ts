import { createContext, useContext } from 'react';
import type { ApiError } from '@/api/client';
import type { Session } from './session';

/** Почему сессии не стало: от этого зависят редирект и сообщение над формой входа. */
export type EndReason = 'expired' | 'other-tab' | 'logout';

export interface SessionContextValue {
  /** `null` — не вошёл. */
  session: Session | null;
  /** Email из `GET /admin/`, пока он не пришёл — из сохранённой сессии. */
  email: string | null;
  /** Идёт проверка токена (`GET /admin/`) после перезагрузки страницы. */
  isLoading: boolean;
  /** Проверка токена не удалась не из-за 401/403 (сеть, 5xx): сессию не сбрасываем, даём повторить. */
  error: ApiError | null;
  /** До автовыхода осталось меньше 10 минут. */
  expiresSoon: boolean;
  /** Когда произойдёт автовыход (мс), `null` без сессии. */
  logoutAt: number | null;
  /** Чем закончилась прошлая сессия; `null`, если её не было или после нового входа. */
  endReason: EndReason | null;
  /** Сохранить сессию после успешного `POST /admin/auth/login`. */
  login: (accessToken: string, expiresIn: number, email: string) => void;
  /** Выход: удалить сессию и очистить кэш запросов. Запроса на бэкенд нет — там нет эндпоинта. */
  logout: () => void;
  /** Повторить проверку токена после сетевой ошибки. */
  retry: () => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession должен вызываться внутри <SessionProvider>');
  return ctx;
}
