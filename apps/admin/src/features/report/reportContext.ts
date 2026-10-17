import type { ReportHeader } from '@podbor/ui';
import type { AdminReportDetail } from '@/api/types';
import { formatCarTitle } from '@/lib/format';

/** Шапка отчёта из ответа `GET /admin/reports/{id}`: машина и подборщик приходят вместе с отчётом (BE-2). */
export function buildReportHeader(detail: Pick<AdminReportDetail, 'car' | 'inspector'>): ReportHeader {
  const { car, inspector } = detail;
  return {
    carTitle: formatCarTitle(car),
    carSubtitle: car.vin ? `VIN ${car.vin}` : undefined,
    inspectorName: inspector.fullName,
  };
}
