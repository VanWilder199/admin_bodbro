import type { ModerationHistoryEntry, ReportStatus } from '@/api/types';

export const ACTION_LABELS: Record<ModerationHistoryEntry['action'], string> = {
  approve: 'Одобрен',
  revise: 'Возвращён на доработку',
  delete: 'Удалён',
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: 'Черновик',
  pending_review: 'На модерации',
  revision_required: 'На доработке',
  published: 'Опубликован',
};

export type StatusTone = 'neutral' | 'ok' | 'warn' | 'bad';

export const REPORT_STATUS_TONES: Record<ReportStatus, StatusTone> = {
  draft: 'neutral',
  pending_review: 'warn',
  revision_required: 'warn',
  published: 'ok',
};

/** Новые записи сверху. Порядок бэкенда (`createdAt DESC`) не берём на веру: сортируем сами, равные даты остаются как были. */
export function sortHistory(history: ModerationHistoryEntry[]): ModerationHistoryEntry[] {
  return [...history].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export interface ReportState {
  /** Момент удаления из `deletedAt`: статус при удалении не меняется, это единственный признак. `null` — не удалён. */
  deletedAt: string | null;
  /** Причина удаления: запись `delete` в журнале (может отсутствовать у отчётов, удалённых до появления журнала). */
  deletionEntry: ModerationHistoryEntry | undefined;
  /** Отчёт вернули на доработку, подборщик исправил и отправил снова. */
  resubmission: ModerationHistoryEntry | undefined;
}

export function getReportState(detail: { report: { status: ReportStatus }; history: ModerationHistoryEntry[]; deletedAt: string | null }): ReportState {
  const sorted = sortHistory(detail.history);
  const latest = sorted[0];
  return {
    deletedAt: detail.deletedAt,
    deletionEntry: sorted.find((entry) => entry.action === 'delete'),
    // `pending_review` и последним решением было «на доработку» → это повторная отправка (отправку подборщиком журнал не пишет)
    resubmission: detail.report.status === 'pending_review' && latest?.action === 'revise' ? latest : undefined,
  };
}
