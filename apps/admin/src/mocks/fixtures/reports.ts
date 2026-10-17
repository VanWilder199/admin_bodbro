import type { AdminReportDetail, CarDto, ModerationHistoryEntry, ReportDto, ReportMedia, ReportSection } from '@/api/types';
import { ADMIN_ID, mail, uuid } from './ids';
import { createInspectors } from './inspectors';

export const ADMIN_EMAIL = mail('admin');

export const CARS: Record<string, CarDto> = {
  [uuid(201)]: { id: uuid(201), vin: 'WVWZZZ3CZHE123456', make: 'Volkswagen', model: 'Passat', year: 2017, avbyListingUrl: 'https://cars.av.by/volkswagen/passat/100000201', listingStatus: 'active' },
  [uuid(202)]: { id: uuid(202), vin: 'WBAFR9C50BC123789', make: 'BMW', model: '520d', year: 2011, avbyListingUrl: 'https://cars.av.by/bmw/5-series/100000202', listingStatus: 'active' },
  // av.by-парсер не всегда находит поля — очередь должна переживать null
  [uuid(203)]: { id: uuid(203), vin: null, make: 'Skoda', model: null, year: null, avbyListingUrl: null, listingStatus: 'active' },
  [uuid(204)]: { id: uuid(204), vin: 'TMBJJ7NE5H0123456', make: 'Skoda', model: 'Octavia', year: 2017, avbyListingUrl: 'https://cars.av.by/skoda/octavia/100000204', listingStatus: 'active' },
  [uuid(205)]: { id: uuid(205), vin: 'VF1RFB00X56123456', make: 'Renault', model: 'Megane', year: 2016, avbyListingUrl: 'https://cars.av.by/renault/megane/100000205', listingStatus: 'sold' },
};

/** Когда отчёт создан (черновик) и когда отправлен на модерацию (BE-3: `reports.submitted_at`). */
export const REPORT_DATES: Record<string, { createdAt: string; submittedAt: string }> = {
  [uuid(401)]: { createdAt: '2026-09-26T16:00:00.000Z', submittedAt: '2026-09-27T08:12:44.512Z' },
  // создан раньше всех, но отправлен повторно после доработки — в очереди он позже, чем 401
  [uuid(402)]: { createdAt: '2026-09-15T10:00:00.000Z', submittedAt: '2026-09-27T10:40:00.000Z' },
  [uuid(403)]: { createdAt: '2026-09-28T06:00:00.000Z', submittedAt: '2026-09-28T07:05:12.000Z' },
  [uuid(404)]: { createdAt: '2026-09-19T09:00:00.000Z', submittedAt: '2026-09-19T12:00:00.000Z' },
  [uuid(405)]: { createdAt: '2026-09-20T09:00:00.000Z', submittedAt: '2026-09-20T12:00:00.000Z' },
};

/** Сколько покупателей ждёт отчёт по машине и сколько оплатило. */
export const REPORT_COUNTS: Record<string, { waitingBuyersCount: number; paidPurchasesCount: number }> = {
  [uuid(401)]: { waitingBuyersCount: 3, paidPurchasesCount: 0 },
  [uuid(402)]: { waitingBuyersCount: 0, paidPurchasesCount: 0 },
  [uuid(403)]: { waitingBuyersCount: 1, paidPurchasesCount: 0 },
  [uuid(404)]: { waitingBuyersCount: 0, paidPurchasesCount: 2 },
  [uuid(405)]: { waitingBuyersCount: 0, paidPurchasesCount: 1 },
};

/** Картинка для `<img>` без внешних ресурсов (работает при CSP `default-src 'self'`). */
function photoDataUrl(label: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#cbd5e1"/>` +
    `<text x="200" y="150" font-size="22" font-family="sans-serif" text-anchor="middle" fill="#334155">${label}</text></svg>`;
  // префикс намеренно отличается от плейсхолдера (`mediaPlaceholder.ts`): иначе адаптер принял бы настоящее фото за заглушку
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function media(id: number, kind: 'PHOTO' | 'VIDEO', s3Key: string): ReportMedia {
  // как на бэкенде: фото после confirm — `uploaded`, видео навсегда `pending` (воркера нет), orderNo всегда 0;
  // у видео в `pending` смотреть нечего, поэтому url = null
  const name = s3Key.split('/').pop() ?? s3Key;
  return { id: uuid(id), kind, s3Key, url: kind === 'PHOTO' ? photoDataUrl(name) : null, status: kind === 'PHOTO' ? 'uploaded' : 'pending', orderNo: 0 };
}

function section(id: number, sectionKey: string, orderNo: number, summary: string | null, items: ReportSection['items'], sectionMedia: ReportMedia[] = []): ReportSection {
  return { id: uuid(id), sectionKey, orderNo, summary, items, media: sectionMedia };
}

interface ReportSeed {
  n: number;
  carId: string;
  inspectorId: string;
  status: ReportDto['status'];
  priceByn: number;
  conclusionText: string | null;
}

function buildReport({ n, carId, inspectorId, status, priceByn, conclusionText }: ReportSeed): ReportDto {
  const id = uuid(n);
  return {
    id,
    carId,
    inspectorId,
    versionNo: 1,
    status,
    priceByn,
    conclusionText,
    stopFactors: ['flood_traces'],
    sections: [
      section(
        n * 10 + 1,
        'EXTERIOR',
        1,
        'Геометрия в норме, небольшая вмятина на задней левой двери.',
        [
          { itemKey: 'geometry', status: 'OK', comment: null },
          { itemKey: 'dents', status: 'WARN', comment: 'Вмятина ~3 см на задней левой двери' },
          { itemKey: 'rust', status: 'OK', comment: null },
        ],
        [media(n * 100 + 1, 'PHOTO', `reports/${id}/sections/exterior/dent.jpg`), media(n * 100 + 2, 'PHOTO', `reports/${id}/sections/exterior/trunk.jpg`)],
      ),
      section(n * 10 + 2, 'PAINT', 2, 'Заднее левое крыло — шпаклёвка.', [
        { itemKey: 'repaint', status: 'WARN', comment: 'Перекрас задней левой двери' },
        { itemKey: 'putty', status: 'BAD', comment: 'Заднее левое крыло — до 480 мкм' },
      ]),
      section(
        n * 10 + 3,
        'INTERIOR',
        3,
        null,
        [
          { itemKey: 'seats', status: 'OK', comment: null },
          { itemKey: 'flood_traces', status: 'BAD', comment: 'Разводы и песок под ковриками' },
        ],
        [media(n * 100 + 3, 'PHOTO', `reports/${id}/sections/interior/floor.jpg`)],
      ),
    ],
    paintMeasurements: [
      { id: uuid(n * 1000 + 1), panelCode: 'HOOD', spot: 'центр', thicknessUm: 118, note: null },
      { id: uuid(n * 1000 + 2), panelCode: 'FENDER_RL', spot: 'арка', thicknessUm: 480, note: 'Шпаклёвка у арки' },
      { id: uuid(n * 1000 + 3), panelCode: 'DOOR_RL', spot: 'центр', thicknessUm: 245, note: 'Перекрас' },
    ],
    globalMedia: [media(n * 100 + 90, 'PHOTO', `reports/${id}/global/odometer.jpg`), media(n * 100 + 91, 'VIDEO', `reports/${id}/global/walkaround.mp4`)],
  };
}

const entry = (action: ModerationHistoryEntry['action'], reason: string | null, createdAt: string): ModerationHistoryEntry => ({
  adminId: ADMIN_ID,
  adminEmail: ADMIN_EMAIL,
  action,
  reason,
  createdAt,
});

/** 401, 402, 403 — в очереди; 404 — опубликован; 405 — удалён (`deletedAt` не `null`, статус остаётся `published`). */
export function createReportDetails(): Record<string, AdminReportDetail> {
  const inspectors = createInspectors();

  const detail = (report: ReportDto, history: ModerationHistoryEntry[], deletedAt: string | null = null): AdminReportDetail => {
    const inspector = inspectors.find((i) => i.id === report.inspectorId)!;
    return {
      report,
      car: CARS[report.carId]!,
      inspector: { id: inspector.id, fullName: inspector.fullName, phone: inspector.phone, email: inspector.email, status: inspector.status },
      ...REPORT_DATES[report.id]!,
      deletedAt,
      ...REPORT_COUNTS[report.id]!,
      history,
    };
  };

  const list: AdminReportDetail[] = [
    detail(buildReport({ n: 401, carId: uuid(201), inspectorId: uuid(103), status: 'pending_review', priceByn: 500_000, conclusionText: 'Машина в целом живая, но есть следы воды в салоне и шпаклёвка на крыле.' }), []),
    detail(
      // повторная отправка после доработки: в истории уже есть revise
      buildReport({ n: 402, carId: uuid(202), inspectorId: uuid(104), status: 'pending_review', priceByn: 320_000, conclusionText: 'Состояние выше среднего для года, двигатель без нареканий.' }),
      [entry('revise', 'Нет фото VIN-таблички, добавьте и отправьте повторно', '2026-09-18T11:02:00Z')],
    ),
    detail(buildReport({ n: 403, carId: uuid(203), inspectorId: uuid(103), status: 'pending_review', priceByn: 275_000, conclusionText: null }), []),
    detail(buildReport({ n: 404, carId: uuid(204), inspectorId: uuid(104), status: 'published', priceByn: 410_000, conclusionText: 'Опубликован ранее.' }), [entry('approve', null, '2026-09-20T09:00:00Z')]),
    detail(
      buildReport({ n: 405, carId: uuid(205), inspectorId: uuid(103), status: 'published', priceByn: 190_000, conclusionText: 'Снят с продажи.' }),
      [entry('delete', 'Дубликат отчёта по этой машине', '2026-09-25T14:00:00Z'), entry('approve', null, '2026-09-21T10:00:00Z')],
      '2026-09-25T14:00:00Z',
    ),
  ];

  return Object.fromEntries(list.map((d) => [d.report.id, d]));
}
