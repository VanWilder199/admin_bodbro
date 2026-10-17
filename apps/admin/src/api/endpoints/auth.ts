import { apiFetch } from '../client';
import type { AdminAuthResponse, AdminInfo, AdminLoginRequest, AdminSetupTotpRequest, AdminTotpSetupResponse } from '../types';

export const authApi = {
  login: (data: AdminLoginRequest) =>
    apiFetch<AdminAuthResponse>('/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  setupTotp: (data: AdminSetupTotpRequest) =>
    apiFetch<AdminTotpSetupResponse>('/admin/auth/setup-totp', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Путь именно со слэшем: `GET /admin` без него — 404 (в Spring Boot 3 trailing slash не матчится). */
  me: () => apiFetch<AdminInfo>('/admin/'),
};
