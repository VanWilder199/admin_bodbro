import type { PayoutBatch } from '@/api/types';

/**
 * Суммы приходят в копейках (целые числа), поэтому складываем их как целые: сумма копеек не накапливает ошибку
 * округления, в отличие от суммы дробных рублей (0,1 + 0,2).
 */
export function totalKopecks(batches: Pick<PayoutBatch, 'amountByn'>[]): number {
  return batches.reduce((sum, batch) => sum + batch.amountByn, 0);
}

const monthYear = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonthYear = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Период батча: «август 2026». Бэкенд отдаёт время запуска планировщика (`2026-08-01T00:00:00.012Z`),
 * поэтому показываем только даты (PLAN_FRONTEND_ADMIN.md, 2.6). Зона UTC — чтобы 1-е число не превращалось
 * в 31-е у админа с отрицательным смещением.
 */
export function formatPeriod(periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';

  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  if (sameMonth) return monthYear.format(start).replace(/\s?г\.?$/, '');
  return `${dayMonthYear.format(start).replace(/\s?г\.?$/, '')} — ${dayMonthYear.format(end).replace(/\s?г\.?$/, '')}`;
}

const dateTime = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** «3 сент. 2026, 09:30» — в зоне админа; для колонок «создан» и «оплачен». */
export function formatStamp(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date).replace(/\s?г\.?,/, ',');
}
