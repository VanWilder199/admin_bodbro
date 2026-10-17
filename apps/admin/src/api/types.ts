/*
 * DTO админского API. Написаны руками по бэкенду (PLAN_FRONTEND_ADMIN.md, раздел 2),
 * до ADM-17 (генерация типов из OpenAPI). Деньги везде в копейках.
 */

// ---------- Auth ----------

export interface AdminLoginRequest {
  email: string;
  password: string;
  totpCode: string;
}

export interface AdminAuthResponse {
  accessToken: string;
  /** Секунды (на бэкенде 86400). */
  expiresIn: number;
}

export interface AdminSetupTotpRequest {
  email: string;
  password: string;
}

export interface AdminTotpSetupResponse {
  secret: string;
  /** otpauth://-ссылка: картинку QR бэкенд не отдаёт, её рисует фронт. */
  otpAuthUrl: string;
}

export interface AdminInfo {
  id: string;
  email: string;
}

// ---------- Moderation ----------

export type ReportStatus = 'draft' | 'pending_review' | 'revision_required' | 'published';

export interface ModerationQueueItem {
  reportId: string;
  carId: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  inspectorId: string;
  /** BE-3. */
  inspectorName: string;
  inspectorStatus: InspectorStatus;
  /** Копейки. */
  priceByn: number;
  /** Отчёт уже возвращали на доработку и отправили снова. */
  resubmitted: boolean;
  versionNo: number;
  /** ISO-8601, момент отправки на модерацию (BE-3, `reports.submitted_at`). */
  submittedAt: string;
}

export interface SectionItem {
  itemKey: string;
  status: 'OK' | 'WARN' | 'BAD';
  comment: string | null;
}

export interface ReportMedia {
  id: string;
  kind: 'PHOTO' | 'VIDEO';
  s3Key: string;
  /** Presigned GET (BE-1, TTL 60 минут). `null` — файла для просмотра нет (например, видео не обработано). */
  url: string | null;
  status: 'uploaded' | 'pending' | 'processing' | 'ready';
  orderNo: number;
}

export interface ReportSection {
  id: string;
  sectionKey: string;
  orderNo: number;
  summary: string | null;
  items: SectionItem[];
  media: ReportMedia[];
}

export interface PaintMeasurement {
  id: string;
  panelCode: string;
  spot: string;
  thicknessUm: number;
  note: string | null;
}

export interface ReportDto {
  id: string;
  carId: string;
  inspectorId: string;
  versionNo: number;
  status: ReportStatus;
  /** Копейки. */
  priceByn: number;
  conclusionText: string | null;
  stopFactors: string[];
  sections: ReportSection[];
  paintMeasurements: PaintMeasurement[];
  globalMedia: ReportMedia[];
}

export interface ModerationHistoryEntry {
  adminId: string;
  /** BE-2. */
  adminEmail: string;
  action: 'approve' | 'revise' | 'delete';
  /** `null` у `approve`. */
  reason: string | null;
  createdAt: string;
}

/** `car/dto/CarDto` бэкенда. */
export interface CarDto {
  id: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  avbyListingUrl: string | null;
  listingStatus?: string | null;
}

export interface ReportInspector {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  status: InspectorStatus;
}

export interface AdminReportDetail {
  report: ReportDto;
  /** BE-2: контекст, которого раньше не было в ответе. */
  car: CarDto;
  inspector: ReportInspector;
  createdAt: string;
  submittedAt: string | null;
  /** `null` — отчёт не удалён. Единственный признак удаления: статус при удалении не меняется. */
  deletedAt: string | null;
  /** Покупатели, ждущие этот отчёт (`report_requests`): им уйдёт уведомление при публикации. */
  waitingBuyersCount: number;
  /** Оплаченные покупки: потеряют доступ при удалении, пока не сделан BE-13. */
  paidPurchasesCount: number;
  /** Сортировка по `createdAt` DESC. */
  history: ModerationHistoryEntry[];
}

export interface ReviseReportRequest {
  reasonText: string;
}

export interface DeleteReportRequest {
  reasonText: string;
}

// ---------- Inspectors ----------

export type InspectorStatus = 'pending' | 'verified' | 'banned';

export interface InspectorDto {
  id: string;
  telegramUserId: number;
  fullName: string;
  phone: string;
  email: string;
  status: InspectorStatus;
}

export interface BanInspectorRequest {
  /** Именно `reason`, а не `reasonText` как у отчётов. */
  reason: string;
}

// ---------- Payouts ----------

export type PayoutStatus = 'pending' | 'paid';

export interface PayoutBatch {
  /** Именно `uuid`, а не `id`. Он же идёт в путь `/admin/payouts/{uuid}/pay`. */
  uuid: string;
  inspectorId: string;
  inspectorName: string;
  inspectorEmail: string;
  periodStart: string;
  periodEnd: string;
  /** Копейки. */
  amountByn: number;
  status: PayoutStatus;
  createdAt: string;
  paidAt: string | null;
}

// ---------- Реестр отчётов (BE-5, ADM-13) ----------

export interface ReportListItem {
  reportId: string;
  status: ReportStatus;
  deletedAt: string | null;
  carId: string;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  inspectorId: string;
  inspectorName: string;
  /** Копейки. */
  priceByn: number;
  createdAt: string;
  submittedAt: string | null;
  paidPurchasesCount: number;
}

// ---------- Дашборд (BE-6, ADM-14) ----------

export interface AdminStats {
  pendingReview: number;
  revisionRequired: number;
  inspectorsPending: number;
  payoutBatchesPending: number;
  /** Копейки. */
  payoutBatchesPendingAmountByn: number;
  /** Копейки. */
  unbatchedPayoutsAmountByn: number;
  purchasesPaidLast30d: number;
  /** Копейки. */
  revenueLast30dByn: number;
  purchasesStuckPending: number;
}

// ---------- Покупки (BE-7, ADM-15) ----------

export type PurchaseStatus = 'pending' | 'paid' | 'failed';

export interface AdminPurchase {
  id: string;
  reportId: string;
  carTitle: string;
  buyerId: string;
  buyerEmail: string | null;
  buyerPhone: string | null;
  /** Копейки. */
  amountByn: number;
  status: PurchaseStatus;
  bepaidCheckoutToken: string | null;
  createdAt: string;
  paidAt: string | null;
  accessTokenExpiresAt: string | null;
  /** Не `null` — ссылка отозвана. */
  accessRevokedAt: string | null;
}

export interface AdminPurchaseDetail extends AdminPurchase {
  /** Начисление подборщику; `null`, пока покупка не оплачена. */
  payout: { id: string; amountByn: number; payoutBatchId: string | null } | null;
}

export interface RevokeAccessRequest {
  reason: string;
}

export interface RevokeAccessResponse {
  accessRevokedAt: string;
}

export interface ReconcileResult {
  checked: number;
  markedPaid: number;
  markedFailed: number;
}

// ---------- Батчи (BE-8, ADM-16) ----------

export interface RunBatchesResult {
  batchesCreated: number;
  /** Копейки. */
  totalAmountByn: number;
}

export interface UnbatchedPayout {
  inspectorId: string;
  inspectorName: string;
  count: number;
  /** Копейки. */
  amountByn: number;
}

export interface PayoutBatchItem {
  purchaseId: string;
  reportId: string;
  /** Копейки. */
  amountByn: number;
  createdAt: string;
}

export interface PayoutBatchDetail extends PayoutBatch {
  items: PayoutBatchItem[];
}
