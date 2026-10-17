/** Куда вести после входа, если `returnTo` не задан или небезопасен. */
export const DEFAULT_RETURN_TO = '/moderation';

/** Экраны входа не могут быть целью возврата: получился бы цикл. */
const GUEST_PATHS = ['/login', '/setup-totp'];

/**
 * Защита от open redirect: `returnTo` принимается только как относительный путь внутри приложения.
 * Возвращает `null`, если значение не подходит.
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  // `//evil.com` и `/\evil.com` браузер читает как адрес другого хоста
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;

  // Страховка от трюков вроде `/\t/evil.com` (WHATWG URL выбрасывает табы и переводы строк до разбора)
  let parsed: URL;
  try {
    parsed = new URL(raw, 'http://returnto.invalid');
  } catch {
    return null;
  }
  if (parsed.origin !== 'http://returnto.invalid') return null;

  if (GUEST_PATHS.some((p) => parsed.pathname === p || parsed.pathname.startsWith(`${p}/`))) return null;
  return parsed.pathname + parsed.search + parsed.hash;
}

/** `returnTo` из query-строки → безопасный путь или значение по умолчанию. */
export function resolveReturnTo(raw: string | null | undefined): string {
  return safeReturnTo(raw) ?? DEFAULT_RETURN_TO;
}
