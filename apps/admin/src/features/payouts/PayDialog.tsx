import { formatByn } from '@podbor/ui/lib/format';
import type { PayoutBatch } from '@/api/types';
import { ConfirmDialog } from '@/features/moderation/dialogs';
import { formatPeriod } from './format';

/**
 * Подтверждение оплаты. Деньги переводятся вне системы (ERIP или банк), здесь только фиксируется факт — поэтому
 * ФИО, период и сумму показываем крупно: админ должен сверить их с тем, что он только что перевёл.
 */
export function PayDialog({ batch, open, onOpenChange, busy, onConfirm }: { batch: PayoutBatch; open: boolean; onOpenChange: (open: boolean) => void; busy: boolean; onConfirm: () => void }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Отметить выплату оплаченной?"
      description={`${batch.inspectorName} · ${formatPeriod(batch.periodStart, batch.periodEnd)} · ${formatByn(batch.amountByn)}. Действие необратимо: отменить отметку нельзя. Подборщику уведомление не уйдёт.`}
      confirmLabel="Отметить оплаченным"
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
