import { useEffect, useState } from 'react';
import type { InspectorDto } from '@/api/types';
import { formatPhone } from '@podbor/ui/lib/format';
import { ConfirmDialog, ReasonDialog } from '@/features/moderation/dialogs';
import type { RunResult } from '@/features/moderation/useModerationActions';

export function VerifyDialog({
  inspector,
  open,
  onOpenChange,
  busy,
  onConfirm,
}: {
  inspector: InspectorDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Верифицировать подборщика?"
      description={`${inspector.fullName}, ${formatPhone(inspector.phone)}. Подборщику уйдёт письмо о подтверждении аккаунта. Убедитесь, что вы проверили человека вне системы.`}
      confirmLabel="Верифицировать"
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}

/**
 * Бан. Честное предупреждение о фактических последствиях (PLAN_FRONTEND_ADMIN.md, С4): сейчас бан ТОЛЬКО запрещает
 * создавать новые отчёты. Админ должен понимать, что больше ничего не произойдёт, и что разбана через API нет.
 */
export function BanDialog({
  inspector,
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  inspector: InspectorDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (reason: string) => Promise<RunResult>;
}) {
  const [understood, setUnderstood] = useState(false);

  // Отметка не переживает закрытие диалога: при каждом открытии админ подтверждает заново
  useEffect(() => {
    if (open) setUnderstood(false);
  }, [open]);

  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      action="ban"
      entityId={inspector.id}
      title={`Забанить: ${inspector.fullName}`}
      description="Причина уйдёт подборщику в письме дословно."
      confirmLabel="Забанить"
      destructive
      placeholder="За что подборщик блокируется"
      extraValid={understood}
      busy={busy}
      onSubmit={onSubmit}
      extra={
        <>
          <div className="space-y-1 rounded-control bg-bad-soft px-4 py-3 text-caption text-bad">
            <p className="font-semibold">Что произойдёт, а что нет</p>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Подборщик больше не сможет создавать новые отчёты.</li>
              <li>Уже опубликованные отчёты продолжат продаваться, начисления по ним пойдут как раньше.</li>
              <li>Существующие черновики он по-прежнему сможет редактировать и отправлять на модерацию.</li>
              <li>Разбанить через админку нельзя.</li>
            </ul>
          </div>
          <label className="flex cursor-pointer items-start gap-3 text-body">
            <input
              type="checkbox"
              checked={understood}
              disabled={busy}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-1 size-5 shrink-0 cursor-pointer accent-primary"
            />
            <span>Понимаю, что разбана нет</span>
          </label>
        </>
      }
    />
  );
}
