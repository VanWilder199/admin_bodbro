import { z } from 'zod';

/** Длина TOTP-кода: SHA1, 6 цифр, шаг 30 с (`AdminAuthServiceImpl`). */
export const TOTP_LENGTH = 6;

/** Оставить только цифры и не больше `TOTP_LENGTH`: кнопку «Вставить» из менеджера паролей часто приносит пробелы. */
export const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, TOTP_LENGTH);

export const emailSchema = z.string().trim().min(1, 'Введите email').email('Проверьте email');
export const passwordSchema = z.string().min(1, 'Введите пароль');
export const totpCodeSchema = z.string().regex(new RegExp(`^\\d{${TOTP_LENGTH}}$`), `Введите ${TOTP_LENGTH}-значный код из приложения`);
