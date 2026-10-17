import { apiFetch } from '../client';
import type { BanInspectorRequest, InspectorDto, InspectorStatus } from '../types';

const inspectorPath = (id: string) => `/admin/inspectors/${encodeURIComponent(id)}`;

export const inspectorsApi = {
  /** Без `status` — все. Неизвестный статус бэкенд не отвергает, а возвращает `[]`. */
  list: (status?: InspectorStatus) =>
    apiFetch<InspectorDto[]>(status ? `/admin/inspectors?status=${encodeURIComponent(status)}` : '/admin/inspectors'),

  verify: (id: string) => apiFetch<InspectorDto>(`${inspectorPath(id)}/verify`, { method: 'POST' }),

  /** Тело `{ reason }` — не `reasonText`, как у отчётов. */
  ban: (id: string, data: BanInspectorRequest) =>
    apiFetch<InspectorDto>(`${inspectorPath(id)}/ban`, { method: 'POST', body: JSON.stringify(data) }),
};
