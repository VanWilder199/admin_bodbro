/* errorCode бэкенда → текст для пользователя. Коды сверены с `shared/exception/ErrorCode.java`. */
export const errorMessages: Record<string, string> = {
  BAD_REQUEST: 'Проверьте правильность заполнения полей',
  ADMIN_INVALID_CREDENTIALS: 'Неверный email или пароль',
  ADMIN_TOTP_INVALID: 'Неверный код. Проверьте время на телефоне',
  ADMIN_TOTP_NOT_CONFIGURED: '', // обработка через редирект на /setup-totp
  ADMIN_TOTP_ALREADY_CONFIGURED: '2FA уже настроена. Для сброса обратитесь к администратору',
  REPORT_NOT_FOUND: 'Отчёт не найден',
  REPORT_NOT_PENDING_REVIEW: 'Отчёт уже не на модерации',
  REPORT_ALREADY_DELETED: 'Отчёт уже удалён',
  INSPECTOR_NOT_FOUND: 'Подборщик не найден',
  INSPECTOR_NOT_PENDING: 'Подборщик уже не ожидает верификации',
  INSPECTOR_ALREADY_BANNED: 'Подборщик уже забанен',
  PAYOUT_NOT_FOUND: 'Батч уже оплачен или не найден',
  PURCHASE_NOT_FOUND: 'Покупка не найдена',
  PURCHASE_NOT_PAID: 'Покупка не оплачена: ссылки на отчёт у неё нет',
  INTERNAL_SERVER_ERROR: 'Ошибка сервера. Попробуйте позже',
};

export function getErrorMessage(code?: string): string {
  if (!code) return 'Произошла ошибка';
  return errorMessages[code] || `Ошибка: ${code}`;
}
