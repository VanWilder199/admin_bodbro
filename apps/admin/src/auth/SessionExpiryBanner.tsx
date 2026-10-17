import { useSession } from './sessionContext';

const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

/**
 * Плашка «сессия скоро закончится». Рендерится внутри `RequireAuth`; в ADM-05 её можно перенести в AppShell.
 * Refresh-токена нет, поэтому предупреждаем заранее: после автовыхода придётся вводить пароль и TOTP-код.
 */
export function SessionExpiryBanner() {
  const { expiresSoon, logoutAt } = useSession();
  if (!expiresSoon || logoutAt === null) return null;

  return (
    <div role="status" className="sticky top-0 z-40 bg-warn-soft px-4 py-2 text-center text-caption font-semibold text-warn">
      Сессия закончится в {timeFormat.format(logoutAt)} — сохраните работу. Потом потребуется войти снова.
    </div>
  );
}
