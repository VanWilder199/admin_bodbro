import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, setUnauthorizedHandler } from '@/api/client';
import { authApi } from '@/api/endpoints/auth';
import { queryKeys } from '@/api/queryKeys';
import { SessionContext, type EndReason, type SessionContextValue } from './sessionContext';
import { clearSession, getSession, getStoredSession, SESSION_STORAGE_KEY, setSession, updateSessionEmail, type Session } from './session';

/** Баннер «сессия истекает» появляется за столько до конца токена. */
export const WARN_BEFORE_MS = 10 * 60 * 1000;
/**
 * Автовыход — за минуту до реального конца токена, а не после него: иначе действие, начатое в последние секунды,
 * упало бы 401 посреди работы (PLAN_FRONTEND_ADMIN.md, 3.1).
 */
export const LOGOUT_MARGIN_MS = 60 * 1000;

/** `setTimeout` не принимает задержку больше 2^31-1 мс (~24,8 суток): дальше будем перепроверять. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Владелец сессии: localStorage, проверка токена, 401/403, таймеры и синхронизация вкладок.
 * Должен стоять внутри `QueryClientProvider`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSessionState] = useState<Session | null>(() => getSession());
  // Токен, только что выданный `login`, проверять через `GET /admin/` незачем: после перезагрузки — нужно.
  const [trusted, setTrusted] = useState(false);
  const [endReason, setEndReason] = useState<EndReason | null>(null);
  const [expiresSoon, setExpiresSoon] = useState(false);

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const endSession = useCallback(
    (reason: EndReason) => {
      clearSession();
      queryClient.clear();
      setSessionState(null);
      setTrusted(false);
      setExpiresSoon(false);
      setEndReason(reason);
    },
    [queryClient],
  );

  // 401/403 на защищённом пути = сессии нет (на /admin/auth/* клиент обработчик не вызывает).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      // Запоздалый ответ после выхода не должен подменить причину «вышел сам» на «сессия истекла».
      if (getStoredSession()) endSession('expired');
    });
    return () => setUnauthorizedHandler(undefined);
  }, [endSession]);

  // Проверка токена при старте: один `GET /admin/`, без повторов при возврате на вкладку.
  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const info = await authApi.me();
      updateSessionEmail(info.email);
      return info;
    },
    enabled: session !== null && !trusted,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Баннер за 10 минут и автовыход. Проверку повторяем и при возврате на вкладку: у фоновых вкладок таймеры замедляются.
  const expiresAt = session?.expiresAt ?? null;
  useEffect(() => {
    if (expiresAt === null) {
      setExpiresSoon(false);
      return;
    }
    const logoutAt = expiresAt - LOGOUT_MARGIN_MS;
    const warnAt = expiresAt - WARN_BEFORE_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = () => {
      clearTimeout(timer);
      const now = Date.now();
      if (now >= logoutAt) {
        endSession('expired');
        return;
      }
      setExpiresSoon(now >= warnAt);
      const next = (now >= warnAt ? logoutAt : warnAt) - now;
      timer = setTimeout(check, Math.min(next, MAX_TIMEOUT_MS));
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    check();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [expiresAt, endSession]);

  // Другая вкладка вошла или вышла: выход в одной вкладке выходит во всех.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== SESSION_STORAGE_KEY) return; // `key === null` — `localStorage.clear()`
      const next = getSession();
      if (!next) {
        if (sessionRef.current) endSession('other-tab');
        return;
      }
      const prev = sessionRef.current;
      if (prev?.accessToken === next.accessToken && prev.expiresAt === next.expiresAt) return;
      setSessionState(next);
      setTrusted(true); // вход выполнен в соседней вкладке, токен только что выдан
      setEndReason(null);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [endSession]);

  const login = useCallback((accessToken: string, expiresIn: number, email: string) => {
    setSessionState(setSession(accessToken, expiresIn, email));
    setTrusted(true);
    setEndReason(null);
  }, []);

  const logout = useCallback(() => endSession('logout'), [endSession]);
  const retry = useCallback(() => {
    void me.refetch();
  }, [me]);

  const meError = me.error instanceof ApiError ? me.error : null;
  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      email: me.data?.email ?? session?.email ?? null,
      isLoading: session !== null && !trusted && me.isPending,
      error: session !== null && !trusted ? meError : null,
      expiresSoon,
      logoutAt: session ? session.expiresAt - LOGOUT_MARGIN_MS : null,
      endReason,
      login,
      logout,
      retry,
    }),
    [session, trusted, me.data, me.isPending, meError, expiresSoon, endReason, login, logout, retry],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
