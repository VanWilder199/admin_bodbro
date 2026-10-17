/**
 * Данные, которые `/login` передаёт на `/setup-totp` через state роутера (PLAN_FRONTEND_ADMIN.md, сценарий С1).
 * Только в памяти: ни в URL, ни в localStorage/sessionStorage пароль не попадает никогда.
 */
export interface SetupTotpState {
  email: string;
  password: string;
}

/** `location.state` может быть чем угодно (после перезагрузки страницы — тем, что сохранил браузер): проверяем форму. */
export function readSetupTotpState(state: unknown): SetupTotpState | null {
  if (typeof state !== 'object' || state === null) return null;
  const { email, password } = state as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  return { email, password };
}
