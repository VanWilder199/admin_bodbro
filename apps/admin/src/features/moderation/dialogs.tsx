import { Button } from '@podbor/ui/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@podbor/ui/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@podbor/ui/components/ui/drawer';
import { FieldMessage } from '@podbor/ui/components/ui/input';
import { Textarea } from '@podbor/ui/components/ui/textarea';
import { useEffect, useState } from 'react';
import { clearDraft, readDraft, writeDraft, type DraftAction } from '@/features/moderation/draft';
import { appendTemplate, REASON_MAX, reasonHint, isReasonValid, type ReasonTemplate } from '@/features/moderation/reason';
import type { RunResult } from '@/features/moderation/useModerationActions';
import { useIsMobile } from '@/hooks/useMediaQuery';

/** Окно по центру на десктопе, шторка снизу на телефоне (решение 5: модерация с телефона). Пока `busy` — не закрывается. */
function Modal({
  open,
  onOpenChange,
  title,
  description,
  busy,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  busy: boolean;
  children: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  const guardedOpenChange = (next: boolean) => !busy && onOpenChange(next);

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={guardedOpenChange} dismissible={!busy}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-2">{children}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={guardedOpenChange}>
      <DialogContent showClose={!busy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Диалог без полей: подтвердить действие кнопкой. Не закрывается, пока идёт запрос. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} busy={busy}>
      <DialogFooter>
        <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
          Отмена
        </Button>
        <Button loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Modal>
  );
}

/**
 * Диалог с обязательной причиной (revise, delete, позже ban). Причина:
 *  - сохраняется в sessionStorage по `draft:<действие>:<id>` и переживает истечение сессии;
 *  - проверяется на фронте (10–2000 символов после `trim`), пока она невалидна — кнопка неактивна;
 *  - уходит подборщику дословно, поэтому админу показан счётчик и предупреждение.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  action,
  entityId,
  title,
  description,
  confirmLabel,
  destructive,
  templates,
  placeholder = 'Что именно нужно исправить или почему отчёт удаляется',
  extraValid = true,
  extra,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: DraftAction;
  entityId: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  templates?: readonly ReasonTemplate[];
  /** Подсказка в пустом поле причины. */
  placeholder?: string;
  /** Дополнительное условие к кнопке: например, введено слово «УДАЛИТЬ». */
  extraValid?: boolean;
  /** Дополнительные поля под причиной. */
  extra?: React.ReactNode;
  busy: boolean;
  /** Результат решает, закрывать ли диалог и стирать ли черновик. */
  onSubmit: (reason: string) => Promise<RunResult>;
}) {
  // Читаем черновик при каждом открытии: диалог может открываться много раз за жизнь страницы
  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason(readDraft(action, entityId));
      setServerError(null);
    }
  }, [open, action, entityId]);

  const update = (next: string) => {
    setReason(next);
    setServerError(null);
    writeDraft(action, entityId, next);
  };

  const hint = serverError ?? reasonHint(reason);
  const valid = isReasonValid(reason) && extraValid;

  const submit = async () => {
    if (!valid || busy) return;
    const result = await onSubmit(reason.trim());
    if (result.kind === 'done' || result.kind === 'conflict') {
      clearDraft(action, entityId);
      onOpenChange(false);
    } else if (result.kind === 'field-error') {
      setServerError(result.message);
    }
    // failed и busy: диалог остаётся открытым, текст на месте — можно повторить
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} busy={busy}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {templates && templates.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Быстрые причины">
            {templates.map((template) => (
              <Button key={template.label} type="button" variant="secondary" size="sm" disabled={busy} onClick={() => update(appendTemplate(reason, template.text))}>
                {template.label}
              </Button>
            ))}
          </div>
        )}

        <div>
          <label htmlFor={`reason-${action}`} className="mb-1.5 block px-1 text-caption font-semibold text-muted-foreground">
            Причина
          </label>
          <Textarea
            id={`reason-${action}`}
            value={reason}
            onChange={(e) => update(e.target.value)}
            disabled={busy}
            aria-invalid={hint ? true : undefined}
            aria-describedby={`reason-${action}-hint`}
            placeholder={placeholder}
            autoFocus
          />
          <div id={`reason-${action}-hint`} className="flex items-start justify-between gap-3">
            {hint ? <FieldMessage error>{hint}</FieldMessage> : <FieldMessage>Текст увидит подборщик — в письме, дословно.</FieldMessage>}
            <FieldMessage className={reason.length > REASON_MAX ? 'text-destructive' : undefined} aria-label="Длина причины">
              {reason.length}/{REASON_MAX}
            </FieldMessage>
          </div>
        </div>

        {extra}

        <DialogFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={!valid}
            className={destructive ? 'bg-destructive text-white hover:brightness-110' : undefined}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </form>
    </Modal>
  );
}
