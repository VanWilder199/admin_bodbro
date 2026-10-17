import { apiFetch } from '../client';
import type { AdminReportDetail, DeleteReportRequest, ModerationQueueItem, ReportListItem, ReviseReportRequest } from '../types';

const reportPath = (id: string) => `/admin/reports/${encodeURIComponent(id)}`;

export const moderationApi = {
  queue: () => apiFetch<ModerationQueueItem[]>('/admin/reports/queue'),

  /** Реестр всех отчётов массивом (BE-5): фильтры и поиск делает клиент, серверная пагинация — второй этап. */
  list: () => apiFetch<ReportListItem[]>('/admin/reports'),

  report: (id: string) => apiFetch<AdminReportDetail>(reportPath(id)),

  /** 200 без тела. */
  approve: (id: string) => apiFetch<void>(`${reportPath(id)}/approve`, { method: 'POST' }),

  /** 200 без тела. */
  revise: (id: string, data: ReviseReportRequest) =>
    apiFetch<void>(`${reportPath(id)}/revise`, { method: 'POST', body: JSON.stringify(data) }),

  /** 200 без тела. */
  delete: (id: string, data: DeleteReportRequest) =>
    apiFetch<void>(`${reportPath(id)}/delete`, { method: 'POST', body: JSON.stringify(data) }),
};
