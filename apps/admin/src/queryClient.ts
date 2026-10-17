import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';

/** Повторять имеет смысл сетевые сбои и 5xx. 4xx (валидация, 401, 404, 409) от повтора не изменятся. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
      },
    },
  });
}
