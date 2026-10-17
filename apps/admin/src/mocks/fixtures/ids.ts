/*
 * Общие утилиты фикстур. Все данные создаются фабриками: каждый `resetMocks()` получает чистую копию,
 * а мутации в хендлерах (approve, verify, pay…) не протекают между тестами.
 */

/** Детерминированный UUID v4-формата: проходит проверку пути, читается в логах. */
export function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export const mail = (name: string) => `${name}@example.com`;
export const phone = (n: number) => `+3752910001${String(n).padStart(2, '0')}`;

export const ADMIN_ID = uuid(900);

/** Учётки для логина в режиме моков. */
export const MOCK_ACCOUNTS = {
  /** TOTP настроен: вход с паролем `password` и кодом `123456`. */
  configured: { email: mail('admin'), password: 'password' },
  /** TOTP не настроен: `login` отвечает 409 ADMIN_TOTP_NOT_CONFIGURED, `setup-totp` проходит. */
  fresh: { email: mail('new-admin'), password: 'password' },
} as const;

export const MOCK_TOTP_CODE = '123456';
export const MOCK_TOKEN = 'mock-token';
