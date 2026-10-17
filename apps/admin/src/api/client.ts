/*
 * Единая точка работы с админским API (PLAN_FRONTEND_ADMIN.md, раздел 2.2).
 * Разбирает все формы ошибок бэкенда:
 *  A  — ProblemDetail с errorCode (AppException);
 *  A' — то же + `errors: ["поле: сообщение"]` (@Valid);
 *  B  — стандартные ошибки Spring MVC: ProblemDetail без errorCode;
 *  C  — 401/403 из Security: JSON Boot без errorCode или пустое тело.
 */

import { getToken } from '@/auth/session';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(
    /** HTTP-статус; 0 — сетевая ошибка, ответа не было. */
    public status: number,
    public errorCode?: string,
    public detail?: string,
    /** Ошибки валидации `@Valid`: поле → сообщение. */
    public fieldErrors?: Record<string, string>,
    public raw?: unknown,
  ) {
    super(detail || `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

let onUnauthorized: (() => void) | undefined;

/** Обработчик «сессии нет» (очистить сессию, уйти на /login). Устанавливается в ADM-03. */
export function setUnauthorizedHandler(fn: (() => void) | undefined) {
  onUnauthorized = fn;
}

/** `["reasonText: must not be blank"]` → `{ reasonText: "must not be blank" }`. */
export function parseFieldErrors(errors: unknown): Record<string, string> | undefined {
  if (!Array.isArray(errors)) return undefined;
  const result: Record<string, string> = {};
  for (const entry of errors) {
    if (typeof entry !== 'string') continue;
    const idx = entry.indexOf(':');
    if (idx === -1) {
      result['_form'] = entry.trim();
    } else {
      result[entry.slice(0, idx).trim()] = entry.slice(idx + 1).trim();
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseBody(text: string): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function defaultDetail(status: number): string {
  if (status === 401) return 'Unauthorized';
  if (status === 403) return 'Forbidden';
  return 'Unknown error';
}

/**
 * Запрос к `/api{path}`. Успех с пустым телом (approve, revise, delete, pay) → `undefined`,
 * поэтому такие эндпоинты типизируются как `apiFetch<void>`.
 * Любая ошибка — `ApiError` (сетевая — со `status: 0`); отмену запроса (`AbortError`) пробрасываем как есть.
 */
export async function apiFetch<T = void>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, undefined, 'Network error', undefined, e);
  }

  // Тело читаем текстом: content-length у chunked-ответов нет, а пустое тело — штатный успех.
  const text = await res.text().catch(() => '');

  if (res.ok) {
    if (text === '') return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, undefined, 'Invalid JSON in response', undefined, text);
    }
  }

  const body = parseBody(text);
  const errorCode = str(body?.errorCode);

  // 401/403 на /admin/auth/* — ошибка формы логина, а не конец сессии. На остальных путях 401 — всегда
  // «сессии нет» (в том числе форма A: удалённый админ с живым токеном получает ADMIN_INVALID_CREDENTIALS),
  // 403 без errorCode — токен не ADMIN (форма C).
  const isAuthPath = path.startsWith('/admin/auth/');
  if (!isAuthPath && (res.status === 401 || (res.status === 403 && !errorCode))) {
    onUnauthorized?.();
  }

  const detail = str(body?.detail) ?? str(body?.title) ?? str(body?.message) ?? str(body?.error) ?? defaultDetail(res.status);
  const fieldErrors = errorCode ? parseFieldErrors(body?.errors) : undefined;

  throw new ApiError(res.status, errorCode, detail, fieldErrors, body ?? (text || null));
}
