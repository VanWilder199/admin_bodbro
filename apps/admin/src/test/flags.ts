import { afterEach, beforeEach } from 'vitest';
import { features, type Features } from '@/features/flags';
import { createAppRoutes } from '@/routes';

const ALL_ON: Features = { reports: true, purchases: true, dashboard: true, batchTools: true, deletionKeepsAccess: false };

/** Маршруты со всеми экранами за флагами (дашборд, реестр, покупки). */
export const allScreensRoutes = createAppRoutes(ALL_ON);

/** Включить флаги на время каждого теста файла и вернуть как было. Флаги читаются компонентами при рендере. */
export function enableFeatures(overrides: Partial<Features> = ALL_ON) {
  let saved: Features;
  beforeEach(() => {
    saved = { ...features };
    Object.assign(features, ALL_ON, overrides);
  });
  afterEach(() => {
    Object.assign(features, saved);
  });
}
