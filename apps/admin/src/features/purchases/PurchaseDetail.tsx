import { formatByn } from '@podbor/ui/lib/format';
import { Badge } from '@podbor/ui/components/ui/badge';
import { Button } from '@podbor/ui/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@podbor/ui/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@podbor/ui/components/ui/drawer';
import { Skeleton } from '@podbor/ui/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { purchasesApi } from '@/api/endpoints/purchases';
import { queryKeys } from '@/api/queryKeys';
import type { AdminPurchaseDetail } from '@/api/types';
import { LoadError } from '@/components/LoadError';
import { ReasonDialog } from '@/features/moderation/dialogs';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { formatDateTime } from '@/lib/format';
import { ACCESS_LABELS, accessState, buyerLabel, PURCHASE_STATUS_LABELS, PURCHASE_STATUS_TONES } from './purchase';
import { useRevokeAccess } from './useRevokeAccess';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-body break-words">{children}</dd>
    </div>
  );
}

const when = (value: string | null) => (value ? formatDateTime(value) : '—');

function DetailBody({ purchase }: { purchase: AdminPurchaseDetail }) {
  const { run, isPending } = useRevokeAccess();
  const [revoking, setRevoking] = useState(false);
  const access = accessState(purchase);

  return (
    <div className="space-y-4" data-testid="purchase-detail">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PURCHASE_STATUS_TONES[purchase.status]}>{PURCHASE_STATUS_LABELS[purchase.status]}</Badge>
        <span className="text-heading font-semibold">{formatByn(purchase.amountByn)}</span>
      </div>

      <dl className="space-y-3">
        <Field label="Отчёт">
          <Link to={`/reports/${purchase.reportId}`} className="font-semibold underline-offset-4 hover:underline">
            {purchase.carTitle}
          </Link>
        </Field>
        <Field label="Покупатель">{buyerLabel(purchase)}</Field>
        <Field label="Создана">{when(purchase.createdAt)}</Field>
        <Field label="Оплачена">{when(purchase.paidAt)}</Field>
        <Field label="Токен bePaid">
          <span className="font-mono text-caption select-all">{purchase.bepaidCheckoutToken ?? '—'}</span>
        </Field>
        <Field label="Ссылка на отчёт">
          <span data-testid="access-state">{ACCESS_LABELS[access]}</span>
          {access === 'revoked' && purchase.accessRevokedAt && <span className="block text-caption text-bad">ссылка отозвана {formatDateTime(purchase.accessRevokedAt)}</span>}
          {(access === 'active' || access === 'expired') && purchase.accessTokenExpiresAt && (
            <span className="block text-caption text-muted-foreground">действует до {formatDateTime(purchase.accessTokenExpiresAt)}</span>
          )}
        </Field>
        <Field label="Начисление подборщику">
          {purchase.payout ? (
            <>
              {formatByn(purchase.payout.amountByn)}
              <span className="block text-caption text-muted-foreground">{purchase.payout.payoutBatchId ? 'в батче выплат' : 'ещё не в батче'}</span>
            </>
          ) : (
            '—'
          )}
        </Field>
      </dl>

      {purchase.status === 'paid' && access !== 'revoked' && (
        <Button variant="secondary" className="text-destructive" onClick={() => setRevoking(true)} disabled={isPending}>
          <Ban aria-hidden />
          Отозвать ссылку
        </Button>
      )}

      <ReasonDialog
        open={revoking}
        onOpenChange={(open) => !open && setRevoking(false)}
        action="revoke"
        entityId={purchase.id}
        title="Отозвать ссылку на отчёт"
        description={`${buyerLabel(purchase)} потеряет доступ к отчёту по этой покупке. Перевыпустить ссылку из админки пока нельзя.`}
        confirmLabel="Отозвать"
        destructive
        placeholder="Почему ссылка отзывается"
        busy={isPending}
        onSubmit={async (reason) => {
          const result = await run(purchase.id, reason);
          if (result.kind === 'done' || result.kind === 'conflict') setRevoking(false);
          return result;
        }}
      />
    </div>
  );
}

function DetailContent({ id }: { id: string }) {
  const purchase = useQuery({ queryKey: queryKeys.purchase(id), queryFn: () => purchasesApi.get(id) });

  if (purchase.isPending) return <Skeleton className="h-64 w-full" aria-busy="true" aria-label="Загрузка покупки" />;
  if (purchase.isError || !purchase.data) return <LoadError error={purchase.error} onRetry={() => void purchase.refetch()} retrying={purchase.isFetching} />;
  return <DetailBody purchase={purchase.data} />;
}

/** Карточка покупки: на десктопе окно по центру, на телефоне — шторка снизу. */
export function PurchaseDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const isMobile = useIsMobile();
  const onOpenChange = (open: boolean) => !open && onClose();

  if (isMobile) {
    return (
      <Drawer open onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Покупка</DrawerTitle>
            <DrawerDescription className="sr-only">Данные покупки и ссылки на отчёт</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-4">
            <DetailContent id={id} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Покупка</DialogTitle>
          <DialogDescription className="sr-only">Данные покупки и ссылки на отчёт</DialogDescription>
        </DialogHeader>
        <DetailContent id={id} />
      </DialogContent>
    </Dialog>
  );
}
