import { describe, expect, it } from 'vitest';
import type { ReportDto, ReportMedia } from '@/api/types';
import { createReportDetails } from '@/mocks/fixtures/reports';
import { uuid } from '@/mocks/fixtures/ids';
import { isPlaceholderUrl } from './mediaPlaceholder';
import { findUnknownSectionKeys, toReportViewData } from './toReportViewData';

/** Фикстура из раздела 2.4 плана: отчёт 401 повторяет форму ответа бэкенда. */
const report = (): ReportDto => createReportDetails()[uuid(401)]!.report;

const media = (overrides: Partial<ReportMedia>): ReportMedia => ({ id: 'm1', kind: 'PHOTO', s3Key: 'reports/r/a.jpg', url: null, status: 'uploaded', orderNo: 0, ...overrides });

describe('toReportViewData', () => {
  it('переносит поля отчёта и не передаёт служебные (inspectorId, versionNo, status)', () => {
    const dto = report();
    const view = toReportViewData(dto);

    expect(view).toMatchObject({ id: dto.id, carId: dto.carId, priceByn: dto.priceByn, conclusionText: dto.conclusionText, stopFactors: dto.stopFactors });
    expect(view).not.toHaveProperty('inspectorId');
    expect(view).not.toHaveProperty('versionNo');
    expect(view).not.toHaveProperty('status');
  });

  it('деньги остаются в копейках — без пересчёта', () => {
    expect(toReportViewData(report()).priceByn).toBe(500_000);
  });

  it('адрес медиа — presigned url из ответа; ключ S3 наружу не передаётся', () => {
    const view = toReportViewData(report());
    const first = view.sections[0]!.media[0]!;
    expect(first).not.toHaveProperty('s3Key');
    expect(first.url).toBe(report().sections[0]!.media[0]!.url);
    expect(isPlaceholderUrl(first.url)).toBe(false);
  });

  it('url == null → плейсхолдер по ключу S3 (видео в pending)', () => {
    const view = toReportViewData(report());
    const video = view.globalMedia[1]!;
    expect(isPlaceholderUrl(video.url)).toBe(true);
    expect(decodeURIComponent(video.url)).toContain('walkaround.mp4');
  });

  it('resolveUrl подменяет источник адреса', () => {
    const view = toReportViewData(report(), (m) => `https://cdn.example/${m.s3Key}`);
    expect(view.sections[0]!.media[0]!.url).toMatch(/^https:\/\/cdn\.example\/reports\//);
    expect(view.globalMedia[0]!.url).toMatch(/^https:\/\/cdn\.example\//);
  });

  it('видео-плейсхолдер отдаётся как картинка: <video> не умеет показывать SVG', () => {
    const view = toReportViewData(report());
    expect(view.globalMedia.map((m) => m.kind)).toEqual(['PHOTO', 'PHOTO']);
    expect(isPlaceholderUrl(view.globalMedia[1]!.url)).toBe(true);
    expect(decodeURIComponent(view.globalMedia[1]!.url)).toContain('Видео');
    expect(decodeURIComponent(view.globalMedia[1]!.url)).toContain('не обработано');
  });

  it('настоящее видео по реальному URL остаётся видео', () => {
    const dto = report();
    dto.globalMedia = [media({ id: 'v', kind: 'VIDEO', s3Key: 'reports/r/w.mp4', status: 'pending' })];
    const view = toReportViewData(dto, () => 'https://cdn.example/w.mp4');
    expect(view.globalMedia[0]!.kind).toBe('VIDEO');
  });

  it('медиа неизвестного типа отбрасывается, остальное сохраняется', () => {
    const dto = report();
    dto.globalMedia = [media({ id: 'ok' }), media({ id: 'bad', kind: 'AUDIO' as never })];
    expect(toReportViewData(dto).globalMedia.map((m) => m.id)).toEqual(['ok']);
  });

  it('пункты внутри секции сортируются по itemKey (бэкенд отдаёт их без ORDER BY)', () => {
    const dto = report();
    dto.sections[0]!.items = [
      { itemKey: 'rust', status: 'OK', comment: null },
      { itemKey: 'dents', status: 'WARN', comment: null },
      { itemKey: 'geometry', status: 'OK', comment: null },
    ];
    expect(toReportViewData(dto).sections[0]!.items.map((i) => i.itemKey)).toEqual(['dents', 'geometry', 'rust']);
  });

  it('summary: null превращается в пустую строку, а не в «null»', () => {
    const view = toReportViewData(report());
    expect(view.sections[2]!.summary).toBe('');
  });

  it('замеры ЛКП переносятся один в один', () => {
    const view = toReportViewData(report());
    expect(view.paintMeasurements).toHaveLength(3);
    expect(view.paintMeasurements[1]).toEqual({ id: expect.any(String), panelCode: 'FENDER_RL', spot: 'арка', thicknessUm: 480, note: 'Шпаклёвка у арки' });
  });

  it('входной объект не мутируется', () => {
    const dto = report();
    dto.sections[0]!.items = [
      { itemKey: 'b', status: 'OK', comment: null },
      { itemKey: 'a', status: 'OK', comment: null },
    ];
    const snapshot = structuredClone(dto);
    toReportViewData(dto);
    expect(dto).toEqual(snapshot);
  });
});

describe('findUnknownSectionKeys', () => {
  it('известные ключи не попадают в список', () => {
    expect(findUnknownSectionKeys(report())).toEqual([]);
  });

  it('неизвестные возвращаются без повторов', () => {
    const dto = report();
    dto.sections[0]!.sectionKey = 'TRUNK_NEW';
    dto.sections[1]!.sectionKey = 'TRUNK_NEW';
    expect(findUnknownSectionKeys(dto)).toEqual(['TRUNK_NEW']);
  });

  it('ключи вроде toString не принимаются за известные', () => {
    const dto = report();
    dto.sections[0]!.sectionKey = 'toString';
    expect(findUnknownSectionKeys(dto)).toEqual(['toString']);
  });
});
