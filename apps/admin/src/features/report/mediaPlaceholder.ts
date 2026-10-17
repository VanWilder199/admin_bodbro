import type { ReportMedia } from '@/api/types';

/*
 * Плейсхолдеры вместо фото и видео, пока у админа нет presigned GET (BE-1): бэкенд отдаёт только `s3Key`.
 * После BE-1 (ADM-11) `resolveUrl` в адаптере начнёт возвращать настоящие адреса, а этот модуль останется
 * запасным вариантом для медиа без URL.
 */

const PLACEHOLDER_PREFIX = 'data:image/svg+xml;charset=utf-8,';

const KIND_LABELS = { PHOTO: 'Фото', VIDEO: 'Видео' } as const;

/** Имя файла из ключа S3: `reports/<id>/global/odometer.jpg` → `odometer.jpg`. */
export function fileNameFromKey(s3Key: string): string {
  const parts = s3Key.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? s3Key;
}

/**
 * Статус обработки медиа человеческим языком. Видео на бэкенде навсегда остаётся `pending`: воркера нет
 * (PLAN_FINAL_CHECKLIST.md, 3.9), поэтому для него это «не обработано», а не «ждёт загрузки».
 */
export function mediaStatusLabel(media: Pick<ReportMedia, 'kind' | 'status'>): string {
  switch (media.status) {
    case 'uploaded':
      return 'загружено';
    case 'pending':
      return media.kind === 'VIDEO' ? 'не обработано' : 'не подтверждено';
    case 'processing':
      return 'обрабатывается';
    case 'ready':
      return 'готово';
    default:
      return String(media.status);
  }
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** SVG-картинка 400×400 с типом, именем файла и статусом. Без внешних ресурсов: работает при `default-src 'self'`. */
export function placeholderUrl(media: Pick<ReportMedia, 'kind' | 's3Key' | 'status'>): string {
  const kind = KIND_LABELS[media.kind] ?? String(media.kind);
  const name = escapeXml(truncate(fileNameFromKey(media.s3Key), 30));
  const status = escapeXml(mediaStatusLabel(media));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" font-family="sans-serif" text-anchor="middle">` +
    `<rect width="400" height="400" fill="#e2e8f0"/>` +
    `<text x="200" y="160" font-size="30" font-weight="700" fill="#334155">${kind}</text>` +
    `<text x="200" y="205" font-size="17" fill="#475569">${name}</text>` +
    `<text x="200" y="235" font-size="17" font-weight="600" fill="#475569">${status}</text>` +
    `<text x="200" y="300" font-size="14" fill="#64748b">Превью недоступно</text>` +
    `</svg>`;

  return PLACEHOLDER_PREFIX + encodeURIComponent(svg);
}

export function isPlaceholderUrl(url: string): boolean {
  return url.startsWith(PLACEHOLDER_PREFIX);
}
