/**
 * Пункты меню и блоки, для которых на бэкенде ещё нет эндпоинтов, скрыты обычной константой (PLAN_FRONTEND_ADMIN.md, ADM-5):
 * инфраструктура feature-флагов для нескольких значений не нужна. Включить — поменять `false` на `true`.
 *
 * ADM-13…16 написаны на моках по контракту из плана (BE-5…BE-8). На настоящем бэкенде этих эндпоинтов пока нет,
 * и включённый пункт вёл бы на экран с ошибкой 404, поэтому по умолчанию они выключены.
 * В режиме моков (`VITE_API_MOCKS=1`) всё включено автоматически.
 */
const mocked = import.meta.env.VITE_API_MOCKS === '1';

export interface Features {
  /** Реестр всех отчётов: `GET /admin/reports` (BE-5, ADM-13). */
  reports: boolean;
  /** Покупки и платежи: `GET /admin/purchases` (BE-7, ADM-15). */
  purchases: boolean;
  /** Дашборд на `/`: `GET /admin/stats` (BE-6, ADM-14, второй этап). */
  dashboard: boolean;
  /** Накопления, ручной запуск батчей и состав батча на `/payouts`; сверка платежей на `/purchases` (BE-8, ADM-16). */
  batchTools: boolean;
  /**
   * BE-13: удалённый опубликованный отчёт снимается с продажи, а купившие СОХРАНЯЮТ доступ.
   * Пока `false`, код ведёт себя наоборот (ссылка у купивших перестаёт работать), и диалог удаления предупреждает об этом.
   */
  deletionKeepsAccess: boolean;
}

/** Объект изменяемый только ради тестов: в коде приложения значения не переключаются. */
export const features: Features = {
  reports: mocked,
  purchases: mocked,
  dashboard: mocked,
  batchTools: mocked,
  deletionKeepsAccess: false,
};
