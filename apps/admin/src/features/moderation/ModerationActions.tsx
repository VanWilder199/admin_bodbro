import { Button } from '@podbor/ui/components/ui/button';
import { FieldMessage, Input } from '@podbor/ui/components/ui/input';
import { CircleCheck, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { AdminReportDetail } from '@/api/types';
import { features } from '@/features/flags';
import { FormLabel } from '@/components/FormLabel';
import { getReportState } from '@/features/report/history';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { DELETE_CONFIRM_WORD, isDeleteConfirmed, REVISE_TEMPLATES } from './reason';
import { ConfirmDialog, ReasonDialog } from './dialogs';
import { useModerationActions } from './useModerationActions';

/** Какие кнопки показать (PLAN_FRONTEND_ADMIN.md, 3.4). Бэкенд всё равно перепроверит — скрытие только для удобства. */
export function availableActions(detail: Pick<AdminReportDetail, 'report' | 'history' | 'deletedAt'>): { approve: boolean; revise: boolean; delete: boolean } {
  const { deletedAt } = getReportState(detail);
  const reviewable = detail.report.status === 'pending_review' && !deletedAt;
  return { approve: reviewable, revise: reviewable, delete: !deletedAt };
}

type Dialog = 'approve' | 'revise' | 'delete' | null;

/** «Одобрить» на всю ширину, под ней «Вернуть» и «Удалить» в ряд. Внизу над safe-area, под шторками диалогов (у них z-50). */
const PHONE_BAR =
  'fixed inset-x-0 bottom-0 z-40 grid grid-cols-[1fr_auto] gap-2 border-t border-border bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]';

/** «3 покупателя», «5 покупателей», «1 покупатель». */
function pluralBuyers(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} покупатель`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} покупателя`;
  return `${count} покупателей`;
}

export function approveDescription(waitingBuyersCount: number): string {
  const base = 'Отчёт станет доступен покупателям. Подборщику уйдёт уведомление.';
  return waitingBuyersCount > 0 ? `${base} Уведомим также ждущих этот отчёт: ${pluralBuyers(waitingBuyersCount)}.` : base;
}

function DeleteConsequences({ published, paidPurchasesCount }: { published: boolean; paidPurchasesCount: number }) {
  return (
    <div className="space-y-2 rounded-control bg-bad-soft px-4 py-3 text-caption text-bad">
      <p className="font-semibold">Удаление необратимо.</p>
      {published &&
        (features.deletionKeepsAccess ? (
          <p>Отчёт снимется с продажи. Купившие сохранят доступ, возврата денег нет.</p>
        ) : (
          <p>
            Отчёт опубликован: у всех, кто уже его купил, ссылка перестанет работать
            {paidPurchasesCount > 0 && ` (оплатили: ${paidPurchasesCount})`}. Возврата денег нет.
          </p>
        ))}
    </div>
  );
}

/** Кнопки решения и три диалога под ними. Показываются только те, что допустимы для текущего состояния отчёта. */
export function ModerationActions({ detail }: { detail: AdminReportDetail }) {
  const reportId = detail.report.id;
  const available = availableActions(detail);
  const { run, isPending } = useModerationActions(reportId);
  const isMobile = useIsMobile();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmWord, setConfirmWord] = useState('');

  if (!available.approve && !available.revise && !available.delete) return null;

  const close = (open: boolean) => {
    if (open) return;
    setDialog(null);
    setConfirmWord('');
  };

  return (
    // На телефоне кнопки закреплены внизу экрана, чтобы не листать отчёт до конца (ReportDetailPage оставляет под ними место)
    <div className={isMobile ? PHONE_BAR : 'space-y-2'} data-testid="moderation-actions">
      {available.approve && (
        <Button block size="lg" className="col-span-2" onClick={() => setDialog('approve')} disabled={isPending}>
          <CircleCheck aria-hidden />
          Одобрить
        </Button>
      )}
      {available.revise && (
        <Button block variant="secondary" onClick={() => setDialog('revise')} disabled={isPending}>
          <RotateCcw aria-hidden />
          Вернуть на доработку
        </Button>
      )}
      {available.delete && (
        <Button block variant="ghost" className="text-destructive" onClick={() => setDialog('delete')} disabled={isPending}>
          <Trash2 aria-hidden />
          Удалить
        </Button>
      )}

      <ConfirmDialog
        open={dialog === 'approve'}
        onOpenChange={close}
        title="Опубликовать отчёт?"
        description={approveDescription(detail.waitingBuyersCount)}
        confirmLabel="Опубликовать"
        busy={isPending}
        onConfirm={async () => {
          const result = await run('approve');
          if (result.kind === 'done' || result.kind === 'conflict') close(false);
        }}
      />

      <ReasonDialog
        open={dialog === 'revise'}
        onOpenChange={close}
        action="revise"
        entityId={reportId}
        title="Вернуть на доработку"
        description="Подборщик получит причину и сможет исправить отчёт и отправить его снова."
        confirmLabel="Вернуть"
        templates={REVISE_TEMPLATES}
        busy={isPending}
        onSubmit={(reason) => run('revise', reason)}
      />

      <ReasonDialog
        open={dialog === 'delete'}
        onOpenChange={close}
        action="delete"
        entityId={reportId}
        title="Удалить отчёт"
        description="Укажите причину удаления и подтвердите действие."
        confirmLabel="Удалить навсегда"
        destructive
        extraValid={isDeleteConfirmed(confirmWord)}
        busy={isPending}
        onSubmit={(reason) => run('delete', reason)}
        extra={
          <>
            <DeleteConsequences published={detail.report.status === 'published'} paidPurchasesCount={detail.paidPurchasesCount} />
            <div>
              <FormLabel htmlFor="delete-confirm">{`Введите «${DELETE_CONFIRM_WORD}» для подтверждения`}</FormLabel>
              <Input id="delete-confirm" value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} disabled={isPending} autoComplete="off" placeholder={DELETE_CONFIRM_WORD} />
              {confirmWord !== '' && !isDeleteConfirmed(confirmWord) && <FieldMessage error>Слово не совпадает</FieldMessage>}
            </div>
          </>
        }
      />
    </div>
  );
}
