import { ReportView, formatPrice } from '@podbor/ui';
import { Card } from '@podbor/ui/components/card';
import { Badge } from '@podbor/ui/components/ui/badge';
import { Button } from '@podbor/ui/components/ui/button';
import { Skeleton } from '@podbor/ui/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, ExternalLink, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { moderationApi } from '@/api/endpoints/moderation';
import { queryKeys } from '@/api/queryKeys';
import type { AdminReportDetail } from '@/api/types';
import { LoadError } from '@/components/LoadError';
import { ModerationActions, availableActions } from '@/features/moderation/ModerationActions';
import { getReportState, ACTION_LABELS, REPORT_STATUS_LABELS, REPORT_STATUS_TONES, sortHistory } from '@/features/report/history';
import { buildReportHeader } from '@/features/report/reportContext';
import { findUnknownSectionKeys, toReportViewData } from '@/features/report/toReportViewData';
import { formatCarTitle, formatDateTime } from '@/lib/format';

/**
 * Карточка живёт дольше, чем очередь: presigned-ссылки на медиа (после BE-1) действуют 60 минут,
 * а перечитывать отчёт каждые 30 секунд незачем — он меняется только решением самого админа.
 */
export const REPORT_STALE_MS = 30 * 60_000;

/** Не чаще одного перезапроса отчёта из-за ошибок загрузки медиа: у десятка фото протухают ссылки одновременно. */
export const MEDIA_REFETCH_COOLDOWN_MS = 10_000;

/** Что считаем «не найден»: нет такого отчёта или невалидный UUID в адресе (форма B, 400). */
export function isReportNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.errorCode === 'REPORT_NOT_FOUND' || error.status === 404 || (error.status === 400 && !error.errorCode));
}

function Banner({ tone, icon, title, children }: { tone: 'warn' | 'bad'; icon: ReactNode; title: string; children?: ReactNode }) {
  const colors = tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn';
  return (
    <div role="status" className={`flex gap-3 rounded-control px-4 py-3 ${colors}`}>
      <div className="mt-0.5 shrink-0 [&_svg]:size-5">{icon}</div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-body font-semibold">{title}</p>
        {children && <div className="text-caption break-words">{children}</div>}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <Card className="mx-auto max-w-sm space-y-4 p-6 text-center">
      <h1 className="text-title font-semibold">Отчёт не найден</h1>
      <p className="text-body text-muted-foreground">Такого отчёта нет или ссылка неверна.</p>
      <Button asChild block>
        <Link to="/moderation">К очереди</Link>
      </Button>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" aria-busy="true" aria-label="Загрузка отчёта">
      <div className="space-y-3">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

function InspectorBlock({ inspector }: { inspector: AdminReportDetail['inspector'] }) {
  return (
    <div className="space-y-1">
      <dt className="text-caption text-muted-foreground">Подборщик</dt>
      <dd className="space-y-1">
        <Link to={`/inspectors?q=${encodeURIComponent(inspector.email)}`} className="font-semibold break-all underline-offset-4 hover:underline">
          {inspector.fullName}
        </Link>
        {inspector.status !== 'verified' && (
          <p className="flex items-center gap-1 text-caption font-semibold text-warn">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {inspector.status === 'banned' ? 'Подборщик заблокирован' : 'Подборщик не верифицирован'}
          </p>
        )}
      </dd>
    </div>
  );
}

function CarBlock({ car }: { car: AdminReportDetail['car'] }) {
  return (
    <div className="space-y-1">
      <dt className="text-caption text-muted-foreground">Машина</dt>
      <dd className="space-y-1">
        <p className="font-semibold">{formatCarTitle(car)}</p>
        {car.vin && <p className="font-mono text-caption break-all select-all">{car.vin}</p>}
        {car.avbyListingUrl && (
          <a href={car.avbyListingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-caption underline-offset-4 hover:underline">
            Объявление на av.by
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </dd>
    </div>
  );
}

function SidePanel({ detail }: { detail: AdminReportDetail }) {
  const { report } = detail;
  const { deletedAt } = getReportState(detail);
  const history = sortHistory(detail.history);

  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Данные отчёта">
      <ModerationActions detail={detail} />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {deletedAt ? <Badge tone="bad">Удалён</Badge> : <Badge tone={REPORT_STATUS_TONES[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Badge>}
          <span className="text-caption text-muted-foreground">версия {report.versionNo}</span>
        </div>

        <dl className="space-y-3 text-body">
          <div className="space-y-1">
            <dt className="text-caption text-muted-foreground">Цена</dt>
            <dd className="font-semibold">{formatPrice(report.priceByn)}</dd>
          </div>
          <InspectorBlock inspector={detail.inspector} />
          <CarBlock car={detail.car} />
          <div className="space-y-1">
            <dt className="text-caption text-muted-foreground">Даты</dt>
            <dd className="space-y-0.5 text-caption">
              <p>Создан: {formatDateTime(detail.createdAt)}</p>
              <p>Отправлен на модерацию: {detail.submittedAt ? formatDateTime(detail.submittedAt) : '—'}</p>
              {deletedAt && <p className="font-semibold text-bad">Удалён: {formatDateTime(deletedAt)}</p>}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-caption text-muted-foreground">Покупатели</dt>
            <dd className="space-y-0.5 text-caption">
              <p>Ждут отчёт: {detail.waitingBuyersCount}</p>
              <p>Оплатили: {detail.paidPurchasesCount}</p>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-caption text-muted-foreground">Отчёт</dt>
            <dd className="font-mono text-caption break-all select-all">{report.id}</dd>
          </div>
        </dl>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-heading font-semibold">История модерации</h2>
        {history.length === 0 ? (
          <p className="text-body text-muted-foreground">Решений пока не было.</p>
        ) : (
          <ol className="space-y-4">
            {history.map((entry, index) => (
              <li key={`${entry.createdAt}-${index}`} className="space-y-0.5">
                <p className="text-body font-semibold">{ACTION_LABELS[entry.action]}</p>
                <p className="text-caption text-muted-foreground">
                  <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                  {' · '}
                  <span className="break-all" title={entry.adminId}>
                    {entry.adminEmail}
                  </span>
                </p>
                {entry.reason && <p className="mt-1 rounded-control bg-secondary px-3 py-2 text-body break-words whitespace-pre-wrap">{entry.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </aside>
  );
}

/** `/reports/:id`: полный отчёт слева, статус, история и действия справа. */
export function ReportDetailPage() {
  const { id = '' } = useParams();

  const report = useQuery({
    queryKey: queryKeys.report(id),
    queryFn: () => moderationApi.report(id),
    staleTime: REPORT_STALE_MS,
    // повторы — по общему правилу (queryClient.ts): сеть и 5xx два раза, а 404 и невалидный UUID (400) сразу показывают «не найден»
  });

  const detail = report.data;

  const viewData = useMemo(() => (detail ? toReportViewData(detail.report) : null), [detail]);
  const header = useMemo(() => (detail ? buildReportHeader(detail) : null), [detail]);
  const unknownSections = useMemo(() => (detail ? findUnknownSectionKeys(detail.report) : []), [detail]);

  // Presigned-ссылка протухла (TTL 60 минут, а карточка могла быть открыта дольше) — перечитываем отчёт и получаем свежие.
  // Одна картинка с битой ссылкой не должна запускать лавину запросов: пока идёт перезапрос и сразу после него новые ошибки не считаются.
  const lastRefetchAt = useRef(0);
  const refetchMedia = report.refetch;
  const onMediaError = useCallback(() => {
    const now = Date.now();
    if (now - lastRefetchAt.current < MEDIA_REFETCH_COOLDOWN_MS) return;
    lastRefetchAt.current = now;
    void refetchMedia();
  }, [refetchMedia]);

  useEffect(() => {
    document.title = `Отчёт — Админка Подбор`;
  }, []);

  if (report.isPending) return <ReportSkeleton />;
  if (report.isError && isReportNotFound(report.error)) return <NotFound />;
  if (report.isError || !detail || !viewData) return <LoadError error={report.error} onRetry={() => void report.refetch()} retrying={report.isFetching} />;

  const { deletedAt, deletionEntry, resubmission } = getReportState(detail);
  const actions = availableActions(detail);
  // На телефоне кнопки решения закреплены внизу (ModerationActions) — оставляем под ними место, чтобы они не закрыли конец страницы
  const hasActions = actions.approve || actions.revise || actions.delete;

  return (
    <div className={hasActions ? 'space-y-4 max-md:pb-36' : 'space-y-4'}>
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/moderation">
          <ArrowLeft aria-hidden />К очереди
        </Link>
      </Button>

      {(deletedAt || resubmission || unknownSections.length > 0) && (
        <div className="space-y-2">
          {deletedAt && (
            <Banner tone="bad" icon={<Trash2 />} title={`Удалён ${formatDateTime(deletedAt)}`}>
              {deletionEntry?.reason ? `Причина: ${deletionEntry.reason}` : 'Причина не указана'}
            </Banner>
          )}
          {resubmission && (
            <Banner tone="warn" icon={<RotateCcw />} title="Повторная отправка после доработки">
              Прошлое решение: «{resubmission.reason}» ({formatDateTime(resubmission.createdAt)})
            </Banner>
          )}
          {unknownSections.length > 0 && (
            <Banner tone="warn" icon={<CircleAlert />} title="В отчёте есть неизвестные разделы">
              {unknownSections.join(', ')} — в просмотре у них не будет названия.
            </Banner>
          )}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 rounded-card bg-background">
          <ReportView report={viewData} header={header ?? undefined} showPrice onMediaError={onMediaError} openOriginal />
        </div>
        <SidePanel detail={detail} />
      </div>
    </div>
  );
}
