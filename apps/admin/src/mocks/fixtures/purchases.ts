import type { AdminPurchaseDetail, PayoutBatchItem, UnbatchedPayout } from '@/api/types';
import { mail, phone, uuid } from './ids';

/** Суммы в копейках. Покупка 501 — оплачена, 502 — ссылка отозвана, 503 и 504 — висят в `pending`, 505 — отказ банка. */
export function createPurchases(): AdminPurchaseDetail[] {
  return [
    {
      id: uuid(501),
      reportId: uuid(404),
      carTitle: 'Skoda Octavia 2017',
      buyerId: uuid(701),
      buyerEmail: mail('buyer.one'),
      buyerPhone: null,
      amountByn: 410_000,
      status: 'paid',
      bepaidCheckoutToken: 'chk_a1b2c3d4e5',
      createdAt: '2026-09-22T10:00:00Z',
      paidAt: '2026-09-22T10:03:00Z',
      accessTokenExpiresAt: '2026-12-22T10:03:00Z',
      accessRevokedAt: null,
      payout: { id: uuid(601), amountByn: 205_000, payoutBatchId: uuid(301) },
    },
    {
      id: uuid(502),
      reportId: uuid(405),
      carTitle: 'Renault Megane 2016',
      buyerId: uuid(702),
      // зашёл по телефону: ссылка уходила только на email, которого нет (PLAN_FINAL_CHECKLIST.md, 2.3)
      buyerEmail: null,
      buyerPhone: phone(11),
      amountByn: 190_000,
      status: 'paid',
      bepaidCheckoutToken: 'chk_f6g7h8i9j0',
      createdAt: '2026-09-23T12:00:00Z',
      paidAt: '2026-09-23T12:02:00Z',
      accessTokenExpiresAt: '2026-12-23T12:02:00Z',
      accessRevokedAt: '2026-09-30T08:15:00Z',
      payout: { id: uuid(602), amountByn: 95_000, payoutBatchId: null },
    },
    {
      id: uuid(503),
      reportId: uuid(404),
      carTitle: 'Skoda Octavia 2017',
      buyerId: uuid(703),
      buyerEmail: mail('buyer.two'),
      buyerPhone: phone(12),
      amountByn: 410_000,
      status: 'pending',
      bepaidCheckoutToken: 'chk_k1l2m3n4o5',
      createdAt: '2026-10-05T09:00:00Z',
      paidAt: null,
      accessTokenExpiresAt: null,
      accessRevokedAt: null,
      payout: null,
    },
    {
      id: uuid(504),
      reportId: uuid(405),
      carTitle: 'Renault Megane 2016',
      buyerId: uuid(704),
      buyerEmail: mail('buyer.three'),
      buyerPhone: null,
      amountByn: 190_000,
      status: 'pending',
      bepaidCheckoutToken: null,
      createdAt: '2026-10-05T11:30:00Z',
      paidAt: null,
      accessTokenExpiresAt: null,
      accessRevokedAt: null,
      payout: null,
    },
    {
      id: uuid(505),
      reportId: uuid(404),
      carTitle: 'Skoda Octavia 2017',
      buyerId: uuid(705),
      buyerEmail: mail('buyer.four'),
      buyerPhone: null,
      amountByn: 410_000,
      status: 'failed',
      bepaidCheckoutToken: 'chk_p6q7r8s9t0',
      createdAt: '2026-09-28T15:00:00Z',
      paidAt: null,
      accessTokenExpiresAt: null,
      accessRevokedAt: null,
      payout: null,
    },
  ];
}

/** Начисления, которые ещё не попали в батч. */
export function createUnbatched(): UnbatchedPayout[] {
  return [
    { inspectorId: uuid(103), inspectorName: 'Олег Кравец', count: 2, amountByn: 60_000 },
    { inspectorId: uuid(104), inspectorName: 'Мария Лисицына', count: 1, amountByn: 15_000 },
  ];
}

const item = (n: number, reportN: number, amountByn: number, createdAt: string): PayoutBatchItem => ({
  purchaseId: uuid(n),
  reportId: uuid(reportN),
  amountByn,
  createdAt,
});

/** Состав батчей: сумма позиций совпадает с `amountByn` батча (приёмка ADM-16). */
export function createBatchItems(): Record<string, PayoutBatchItem[]> {
  return {
    [uuid(301)]: [item(511, 404, 50_000, '2026-09-05T10:00:00Z'), item(512, 404, 45_000, '2026-09-12T10:00:00Z'), item(513, 405, 30_000, '2026-09-20T10:00:00Z')],
    [uuid(302)]: [item(514, 404, 28_750, '2026-09-09T10:00:00Z'), item(515, 405, 20_000, '2026-09-18T10:00:00Z')],
    [uuid(303)]: [item(516, 404, 100_000, '2026-08-07T10:00:00Z'), item(517, 405, 110_000, '2026-08-21T10:00:00Z')],
    [uuid(304)]: [item(518, 404, 92_500, '2026-08-15T10:00:00Z')],
  };
}
