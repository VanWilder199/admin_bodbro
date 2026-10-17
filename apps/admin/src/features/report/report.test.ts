import { describe, expect, it } from 'vitest';
import type { ModerationHistoryEntry, ReportStatus } from '@/api/types';
import { fileNameFromKey, isPlaceholderUrl, mediaStatusLabel, placeholderUrl } from './mediaPlaceholder';
import { getReportState, sortHistory } from './history';

const entry = (action: ModerationHistoryEntry['action'], createdAt: string, reason: string | null = null): ModerationHistoryEntry => ({
  adminId: 'a',
  adminEmail: 'admin@example.com',
  action,
  reason,
  createdAt,
});

const detail = (status: ReportStatus, history: ModerationHistoryEntry[], deletedAt: string | null = null) => ({ report: { status }, history, deletedAt });

describe('mediaPlaceholder', () => {
  it('имя файла — последний сегмент ключа S3', () => {
    expect(fileNameFromKey('reports/5b1c/sections/9f10/dent.jpg')).toBe('dent.jpg');
    expect(fileNameFromKey('plain.jpg')).toBe('plain.jpg');
    expect(fileNameFromKey('reports/x/')).toBe('x');
    expect(fileNameFromKey('')).toBe('');
  });

  it('видео в pending — «не обработано» (воркера нет), фото в pending — «не подтверждено»', () => {
    expect(mediaStatusLabel({ kind: 'VIDEO', status: 'pending' })).toBe('не обработано');
    expect(mediaStatusLabel({ kind: 'PHOTO', status: 'pending' })).toBe('не подтверждено');
    expect(mediaStatusLabel({ kind: 'PHOTO', status: 'uploaded' })).toBe('загружено');
    expect(mediaStatusLabel({ kind: 'VIDEO', status: 'processing' })).toBe('обрабатывается');
    expect(mediaStatusLabel({ kind: 'VIDEO', status: 'ready' })).toBe('готово');
  });

  it('плейсхолдер — SVG с типом, именем и статусом, без внешних ресурсов', () => {
    const url = placeholderUrl({ kind: 'VIDEO', s3Key: 'reports/r/walkaround.mp4', status: 'pending' });
    const svg = decodeURIComponent(url.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(isPlaceholderUrl(url)).toBe(true);
    expect(svg).toContain('Видео');
    expect(svg).toContain('walkaround.mp4');
    expect(svg).toContain('не обработано');
    // внешних ресурсов нет: ни ссылок, ни подгружаемых картинок (иначе CSP `default-src 'self'` их заблокирует)
    expect(svg).not.toContain('href=');
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('http://www.w3.org/1999/xlink');
  });

  it('имя файла экранируется: ключ с угловыми скобками не ломает SVG', () => {
    const url = placeholderUrl({ kind: 'PHOTO', s3Key: 'reports/<script>"x".jpg', status: 'uploaded' });
    const svg = decodeURIComponent(url.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('длинное имя файла обрезается', () => {
    const url = placeholderUrl({ kind: 'PHOTO', s3Key: `reports/${'a'.repeat(80)}.jpg`, status: 'uploaded' });
    expect(decodeURIComponent(url)).toContain('…');
  });

  it('обычный URL плейсхолдером не считается', () => {
    expect(isPlaceholderUrl('https://cdn.example/a.jpg')).toBe(false);
  });
});

describe('sortHistory', () => {
  it('от новых к старым, независимо от порядка на входе', () => {
    const sorted = sortHistory([entry('approve', '2026-09-20T09:00:00Z'), entry('delete', '2026-09-25T14:00:00Z'), entry('revise', '2026-09-18T11:02:00Z')]);
    expect(sorted.map((e) => e.action)).toEqual(['delete', 'approve', 'revise']);
  });

  it('входной массив не меняется', () => {
    const input = [entry('approve', '2026-09-20T09:00:00Z'), entry('delete', '2026-09-25T14:00:00Z')];
    sortHistory(input);
    expect(input.map((e) => e.action)).toEqual(['approve', 'delete']);
  });
});

describe('getReportState', () => {
  it('удалён — признак это deletedAt, а не журнал; причина берётся из записи delete', () => {
    const state = getReportState(
      detail('published', [entry('delete', '2026-09-25T14:00:00Z', 'дубликат'), entry('approve', '2026-09-21T10:00:00Z')], '2026-09-25T14:00:00Z'),
    );
    expect(state.deletedAt).toBe('2026-09-25T14:00:00Z');
    expect(state.deletionEntry?.reason).toBe('дубликат');
    expect(state.resubmission).toBeUndefined();
  });

  it('запись delete в журнале без deletedAt отчёт удалённым не делает', () => {
    const state = getReportState(detail('published', [entry('delete', '2026-09-25T14:00:00Z', 'дубликат')]));
    expect(state.deletedAt).toBeNull();
  });

  it('deletedAt без записи в журнале — удалён, причины нет', () => {
    const state = getReportState(detail('published', [], '2026-09-25T14:00:00Z'));
    expect(state.deletedAt).toBe('2026-09-25T14:00:00Z');
    expect(state.deletionEntry).toBeUndefined();
  });

  it('повторная отправка — pending_review и последнее решение revise', () => {
    const state = getReportState(detail('pending_review', [entry('revise', '2026-09-18T11:02:00Z', 'нет VIN')]));
    expect(state.resubmission?.reason).toBe('нет VIN');
    expect(state.deletedAt).toBeNull();
  });

  it('pending_review без истории — обычная первая отправка', () => {
    expect(getReportState(detail('pending_review', []))).toEqual({ deletedAt: null, deletionEntry: undefined, resubmission: undefined });
  });

  it('revise давно, а потом approve — это не повторная отправка', () => {
    const state = getReportState(detail('pending_review', [entry('revise', '2026-09-18T00:00:00Z'), entry('approve', '2026-09-19T00:00:00Z')]));
    expect(state.resubmission).toBeUndefined();
  });

  it('статус revision_required сам по себе — не «повторная отправка»', () => {
    expect(getReportState(detail('revision_required', [entry('revise', '2026-09-18T00:00:00Z')])).resubmission).toBeUndefined();
  });
});
