import { SECTION_LABELS } from '@podbor/ui';
import type { MediaKind, PaintMeasurement as UiPaintMeasurement, ReportMedia as UiReportMedia, ReportSection as UiReportSection, ReportViewData, SectionKey } from '@podbor/ui';
import type { ReportDto, ReportMedia } from '@/api/types';
import { isPlaceholderUrl, placeholderUrl } from './mediaPlaceholder';

/** Как получить адрес медиа. */
export type ResolveMediaUrl = (media: ReportMedia) => string;

/** Presigned GET из ответа (BE-1); плейсхолдер только там, где файла для просмотра нет (`url == null`). */
export const resolveMediaUrl: ResolveMediaUrl = (media) => media.url ?? placeholderUrl(media);

const isMediaKind = (kind: string): kind is MediaKind => kind === 'PHOTO' || kind === 'VIDEO';
const isSectionKey = (key: string): key is SectionKey => Object.hasOwn(SECTION_LABELS, key);

function toUiMedia(media: ReportMedia, resolveUrl: ResolveMediaUrl): UiReportMedia | null {
  // Неизвестный тип отбрасываем: `ReportView` умеет рисовать только фото и видео
  if (!isMediaKind(media.kind)) return null;

  const url = resolveUrl(media);
  return {
    id: media.id,
    // `<video>` не умеет показывать SVG, поэтому плейсхолдер видео рисуем как картинку-плитку: тип и статус написаны на ней
    kind: media.kind === 'VIDEO' && isPlaceholderUrl(url) ? 'PHOTO' : media.kind,
    url,
    status: media.status,
    orderNo: media.orderNo,
  };
}

function toUiMediaList(list: ReportMedia[], resolveUrl: ResolveMediaUrl): UiReportMedia[] {
  return list.flatMap((m) => toUiMedia(m, resolveUrl) ?? []);
}

/**
 * Админский `ReportDto` → `ReportViewData` для общего компонента `ReportView` (PLAN_FRONTEND_ADMIN.md, 2.4).
 * Чистая функция: входной объект не меняется.
 *  - адрес медиа — через `resolveUrl` (по умолчанию presigned `url`, иначе плейсхолдер по `s3Key`);
 *  - `inspectorId`, `versionNo`, `status` не передаются: админка показывает их в боковой панели;
 *  - пункты внутри секции сортируются по `itemKey`: бэкенд отдаёт их без `ORDER BY` (BE-14), а `ReportView` сортирует
 *    только по важности (стабильно), так что порядок внутри одной важности иначе менялся бы от запроса к запросу.
 */
export function toReportViewData(report: ReportDto, resolveUrl: ResolveMediaUrl = resolveMediaUrl): ReportViewData {
  const sections: UiReportSection[] = report.sections.map((section) => ({
    id: section.id,
    // Неизвестный ключ секции не прячем (модератор должен увидеть данные), см. `findUnknownSectionKeys`
    sectionKey: section.sectionKey as SectionKey,
    orderNo: section.orderNo,
    summary: section.summary ?? '',
    items: [...section.items].sort((a, b) => a.itemKey.localeCompare(b.itemKey)),
    media: toUiMediaList(section.media, resolveUrl),
  }));

  const paintMeasurements: UiPaintMeasurement[] = report.paintMeasurements.map((m) => ({
    id: m.id,
    panelCode: m.panelCode,
    spot: m.spot,
    thicknessUm: m.thicknessUm,
    note: m.note,
  }));

  return {
    id: report.id,
    carId: report.carId,
    priceByn: report.priceByn,
    conclusionText: report.conclusionText,
    stopFactors: report.stopFactors,
    sections,
    paintMeasurements,
    globalMedia: toUiMediaList(report.globalMedia, resolveUrl),
  };
}

/** Ключи секций, которых нет в справочнике `ReportView`: у них в отчёте будет пустая подпись, админу об этом надо сказать. */
export function findUnknownSectionKeys(report: ReportDto): string[] {
  return [...new Set(report.sections.map((s) => s.sectionKey).filter((key) => !isSectionKey(key)))];
}
