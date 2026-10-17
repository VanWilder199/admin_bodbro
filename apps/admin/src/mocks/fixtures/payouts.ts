import type { PayoutBatch } from '@/api/types';
import { mail, uuid } from './ids';

const SEPTEMBER = { periodStart: '2026-09-01T00:00:00Z', periodEnd: '2026-09-30T23:59:59Z', createdAt: '2026-10-01T03:00:00Z' };
const AUGUST = { periodStart: '2026-08-01T00:00:00Z', periodEnd: '2026-08-31T23:59:59Z', createdAt: '2026-09-01T03:00:00Z' };

/** Суммы в копейках. */
export function createPayouts(): PayoutBatch[] {
  return [
    { uuid: uuid(301), inspectorId: uuid(103), inspectorName: 'Олег Кравец', inspectorEmail: mail('oleg.kravets'), ...SEPTEMBER, amountByn: 125_000, status: 'pending', paidAt: null },
    { uuid: uuid(302), inspectorId: uuid(104), inspectorName: 'Мария Лисицына', inspectorEmail: mail('maria.lisitsyna'), ...SEPTEMBER, amountByn: 48_750, status: 'pending', paidAt: null },
    { uuid: uuid(303), inspectorId: uuid(103), inspectorName: 'Олег Кравец', inspectorEmail: mail('oleg.kravets'), ...AUGUST, amountByn: 210_000, status: 'paid', paidAt: '2026-09-03T09:30:00Z' },
    { uuid: uuid(304), inspectorId: uuid(104), inspectorName: 'Мария Лисицына', inspectorEmail: mail('maria.lisitsyna'), ...AUGUST, amountByn: 92_500, status: 'paid', paidAt: '2026-09-03T09:31:00Z' },
  ];
}
