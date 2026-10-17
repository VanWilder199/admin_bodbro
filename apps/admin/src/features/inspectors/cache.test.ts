import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from '@/api/queryKeys';
import type { InspectorDto } from '@/api/types';
import { createInspectors } from '@/mocks/fixtures/inspectors';
import { uuid } from '@/mocks/fixtures/ids';
import { applyInspectorUpdate } from './cache';

/** Кеш в том виде, в каком его наполняют вкладки страницы подборщиков. */
function seededClient() {
  const all = createInspectors();
  const client = new QueryClient();
  client.setQueryData(queryKeys.inspectors(), all);
  client.setQueryData(queryKeys.inspectors('pending'), all.filter((i) => i.status === 'pending'));
  client.setQueryData(queryKeys.inspectors('verified'), all.filter((i) => i.status === 'verified'));
  client.setQueryData(queryKeys.inspectors('banned'), all.filter((i) => i.status === 'banned'));
  return client;
}

const ids = (client: QueryClient, status?: string) => (client.getQueryData<InspectorDto[]>(queryKeys.inspectors(status)) ?? []).map((i) => i.id);
const find = (client: QueryClient, status: string | undefined, id: string) => client.getQueryData<InspectorDto[]>(queryKeys.inspectors(status))?.find((i) => i.id === id);

describe('applyInspectorUpdate', () => {
  it('verify: из «Ожидают» запись уходит, в «Все» заменяется свежей, в «Верифицированы» без перезапроса не появляется', () => {
    const client = seededClient();
    const updated = { ...find(client, 'pending', uuid(101))!, status: 'verified' as const };

    applyInspectorUpdate(client, updated);

    expect(ids(client, 'pending')).not.toContain(uuid(101));
    expect(find(client, undefined, uuid(101))?.status).toBe('verified');
    // добавление в список нового статуса оставлено перезапросу: порядок и состав знает только сервер
    expect(ids(client, 'verified')).not.toContain(uuid(101));
  });

  it('ban из «Верифицированы»: запись уходит оттуда, а в «Забанены» и «Все» остаётся согласованной', () => {
    const client = seededClient();
    const updated = { ...find(client, 'verified', uuid(103))!, status: 'banned' as const };

    applyInspectorUpdate(client, updated);

    expect(ids(client, 'verified')).not.toContain(uuid(103));
    expect(find(client, undefined, uuid(103))?.status).toBe('banned');
  });

  it('запись, которая уже лежит в списке своего нового статуса, заменяется на месте', () => {
    const client = seededClient();
    const updated = { ...find(client, 'banned', uuid(105))!, fullName: 'Денис Новый' };

    applyInspectorUpdate(client, updated);

    expect(find(client, 'banned', uuid(105))?.fullName).toBe('Денис Новый');
    expect(ids(client, 'banned')).toHaveLength(1);
  });

  it('другие подборщики не затрагиваются', () => {
    const client = seededClient();
    const before = structuredClone(client.getQueryData(queryKeys.inspectors()));
    applyInspectorUpdate(client, { ...find(client, 'pending', uuid(101))!, status: 'verified' as const });

    const after = client.getQueryData<InspectorDto[]>(queryKeys.inspectors())!;
    expect(after.filter((i) => i.id !== uuid(101))).toEqual((before as InspectorDto[]).filter((i) => i.id !== uuid(101)));
  });

  it('порядок в списке сохраняется', () => {
    const client = seededClient();
    const order = ids(client);
    applyInspectorUpdate(client, { ...find(client, undefined, uuid(102))!, status: 'verified' as const });
    expect(ids(client)).toEqual(order);
  });

  it('не падает на незагруженных списках и на других ключах кеша', () => {
    const client = new QueryClient();
    client.setQueryData(['payouts', 'all'], [{ uuid: 'x' }]);
    expect(() => applyInspectorUpdate(client, { ...createInspectors()[0]! })).not.toThrow();
    expect(client.getQueryData(['payouts', 'all'])).toEqual([{ uuid: 'x' }]);
  });
});
