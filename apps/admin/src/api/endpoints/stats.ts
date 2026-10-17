import { apiFetch } from '../client';
import type { AdminStats } from '../types';

export const statsApi = {
  /** Счётчики дашборда (BE-6). */
  get: () => apiFetch<AdminStats>('/admin/stats'),
};
