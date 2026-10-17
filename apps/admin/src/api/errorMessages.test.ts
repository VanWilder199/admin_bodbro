import { describe, expect, it } from 'vitest';
import { errorMessages, getErrorMessage } from './errorMessages';

describe('getErrorMessage', () => {
  it('известный код → текст из таблицы', () => {
    expect(getErrorMessage('ADMIN_TOTP_INVALID')).toBe(errorMessages.ADMIN_TOTP_INVALID);
  });

  it('неизвестный код → виден в тексте, чтобы его можно было найти в бэкенде', () => {
    expect(getErrorMessage('SOMETHING_NEW')).toBe('Ошибка: SOMETHING_NEW');
  });

  it('нет кода (формы B и C) → общий текст', () => {
    expect(getErrorMessage(undefined)).toBe('Произошла ошибка');
  });

  it('все коды из таблицы — заглавные snake_case, как в ErrorCode бэкенда', () => {
    for (const code of Object.keys(errorMessages)) expect(code).toMatch(/^[A-Z][A-Z_]+$/);
  });
});
