import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/client';
import { shouldRetry } from './queryClient';

describe('shouldRetry', () => {
  it('сетевая ошибка и 5xx повторяются, но не больше двух раз', () => {
    expect(shouldRetry(0, new ApiError(0))).toBe(true);
    expect(shouldRetry(1, new ApiError(503))).toBe(true);
    expect(shouldRetry(2, new ApiError(503))).toBe(false);
  });

  it.each([400, 401, 403, 404, 409])('%i от повтора не изменится — не повторяем', (status) => {
    expect(shouldRetry(0, new ApiError(status))).toBe(false);
  });

  it('неизвестная ошибка (не ApiError) повторяется как сетевая', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
  });
});
