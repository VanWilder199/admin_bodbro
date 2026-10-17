/*
 * Сессия админа в localStorage (PLAN_FRONTEND_ADMIN.md, 3.1). Единственное место, которое знает ключ и формат.
 * Пароль сюда не попадает никогда: в хранилище лежат только токен, срок и email.
 */

export const SESSION_STORAGE_KEY = 'podbor.admin.session';

export interface Session {
  accessToken: string;
  /** Unix-время в миллисекундах. */
  expiresAt: number;
  email: string;
}

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { accessToken, expiresAt, email } = value as Record<string, unknown>;
    if (typeof accessToken !== 'string' || accessToken === '') return null;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
    return { accessToken, expiresAt, email: typeof email === 'string' ? email : '' };
  } catch {
    return null; // битый JSON в хранилище = сессии нет
  }
}

/** Сессия как лежит в хранилище, без проверки срока. Нужна, чтобы отличить «истекла» от «никогда не входил». */
export function getStoredSession(): Session | null {
  try {
    return parse(localStorage.getItem(SESSION_STORAGE_KEY));
  } catch {
    return null; // хранилище недоступно (приватный режим, запрет cookies)
  }
}

/** Действующая сессия: срок не истёк. */
export function getSession(): Session | null {
  const session = getStoredSession();
  return session && session.expiresAt > Date.now() ? session : null;
}

/** `expiresIn` бэкенд отдаёт в секундах (86400), `expiresAt` хранится в миллисекундах. */
export function setSession(accessToken: string, expiresIn: number, email: string): Session {
  const session: Session = { accessToken, expiresAt: Date.now() + expiresIn * 1000, email };
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // сессия останется только в памяти провайдера: после перезагрузки придётся войти снова
  }
  return session;
}

/** Обновить email (после `GET /admin/`), не трогая токен и срок. */
export function updateSessionEmail(email: string): void {
  const session = getStoredSession();
  if (!session || session.email === email) return;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...session, email }));
  } catch {
    // см. setSession
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // нечего чистить
  }
}

export function getToken(): string | null {
  return getSession()?.accessToken ?? null;
}
