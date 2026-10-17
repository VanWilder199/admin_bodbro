import { Button } from '@podbor/ui/components/ui/button';
import { ApiError } from '@/api/client';
import { getErrorMessage } from '@/api/errorMessages';

/** Что показать пользователю по ошибке запроса: код бэкенда, если он известен, иначе по типу сбоя. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Нет связи с сервером. Проверьте интернет и повторите.';
    if (error.errorCode) return getErrorMessage(error.errorCode);
    if (error.status >= 500) return 'Сервер временно недоступен. Попробуйте позже.';
  }
  return 'Не удалось загрузить данные.';
}

/** Inline-блок ошибки загрузки списка: вместо таблицы, меню остаётся рабочим (PLAN_FRONTEND_ADMIN.md, 3.6). */
export function LoadError({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card bg-card p-8 text-center">
      <p className="text-body text-foreground">{describeError(error)}</p>
      <Button variant="secondary" onClick={onRetry} loading={retrying}>
        Повторить
      </Button>
    </div>
  );
}
