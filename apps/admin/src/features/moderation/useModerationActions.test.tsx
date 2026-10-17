import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { describe, expect, it } from 'vitest';
import { MOCK_TOKEN, uuid } from '@/mocks/fixtures/ids';
import { server } from '@/test/server';
import { recordRequests, storeSession } from '@/test/utils';
import { useModerationActions } from './useModerationActions';

function setup(reportId = uuid(401)) {
  storeSession({ accessToken: MOCK_TOKEN });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return renderHook(() => useModerationActions(reportId), { wrapper });
}

describe('защита от двойного действия на уровне хука', () => {
  it('два вызова подряд без ожидания: второй получает busy, на сервер уходит один запрос', async () => {
    server.use(
      http.post(`/api/admin/reports/${uuid(401)}/approve`, async () => {
        await delay(50);
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const requests = recordRequests(server);
    const { result } = setup();

    let first!: Awaited<ReturnType<typeof result.current.run>>;
    let second!: Awaited<ReturnType<typeof result.current.run>>;
    await act(async () => {
      // оба вызова стартуют в одном тике — до того, как React успеет перерисовать и выставить isPending
      const a = result.current.run('approve');
      const b = result.current.run('approve');
      [first, second] = await Promise.all([a, b]);
    });

    expect(second).toEqual({ kind: 'busy' });
    expect(first).toEqual({ kind: 'done' });
    expect(requests.filter((r) => r === `POST /api/admin/reports/${uuid(401)}/approve`)).toHaveLength(1);
  });

  it('после завершения первого действия следующее проходит', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.run('approve');
    });
    const requests = recordRequests(server);
    await act(async () => {
      await result.current.run('delete', 'причина удаления отчёта');
    });
    expect(requests.some((r) => r.endsWith('/delete'))).toBe(true);
  });

  it('флаг сбрасывается и после ошибки: повтор возможен', async () => {
    server.use(http.post(`/api/admin/reports/${uuid(401)}/approve`, () => HttpResponse.json({ errorCode: 'INTERNAL_SERVER_ERROR' }, { status: 500 }), { once: true }));
    const { result } = setup();
    let first!: Awaited<ReturnType<typeof result.current.run>>;
    await act(async () => {
      first = await result.current.run('approve');
    });
    expect(first).toEqual({ kind: 'failed' });

    let second!: Awaited<ReturnType<typeof result.current.run>>;
    await act(async () => {
      second = await result.current.run('approve');
    });
    expect(second).toEqual({ kind: 'done' });
  });
});
