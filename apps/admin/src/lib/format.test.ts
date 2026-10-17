import { describe, expect, it } from 'vitest';
import { formatCarTitle, formatDateTime, formatRelativeTime, shortId } from './format';

const NOW = new Date('2026-10-07T12:00:00Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('меньше минуты — «только что»', () => {
    expect(formatRelativeTime(ago(10_000), NOW)).toBe('только что');
  });

  it.each([
    [5 * MIN, '5 минут назад'],
    [21 * MIN, '21 минуту назад'],
    [3 * HOUR, '3 часа назад'],
    [5 * HOUR, '5 часов назад'],
    [2 * DAY, '2 дня назад'],
    [7 * DAY, '7 дней назад'],
    [60 * DAY, '2 месяца назад'],
    [2 * 365 * DAY, '2 года назад'],
  ])('%i мс → «%s»', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), NOW)).toBe(expected);
  });

  it('дата из будущего (часы клиента отстают) — «только что», а не «через…»', () => {
    expect(formatRelativeTime(new Date(NOW + 5 * MIN).toISOString(), NOW)).toBe('только что');
  });

  it('невалидная дата — прочерк', () => {
    expect(formatRelativeTime('не дата', NOW)).toBe('—');
  });

  it('принимает Date', () => {
    expect(formatRelativeTime(new Date(NOW - 5 * MIN), new Date(NOW))).toBe('5 минут назад');
  });
});

describe('formatDateTime', () => {
  it('дата и время по-русски', () => {
    expect(formatDateTime('2026-09-27T08:12:00Z')).toMatch(/27 сентября 2026/);
  });
  it('невалидная — прочерк', () => {
    expect(formatDateTime('x')).toBe('—');
  });
});

describe('formatCarTitle', () => {
  it('марка, модель и год через пробел', () => {
    expect(formatCarTitle({ make: 'Volkswagen', model: 'Passat', year: 2017 })).toBe('Volkswagen Passat 2017');
  });
  it('пропускает отсутствующие поля', () => {
    expect(formatCarTitle({ make: 'Skoda', model: null, year: null })).toBe('Skoda');
    expect(formatCarTitle({ make: null, model: 'Octavia', year: 2017 })).toBe('Octavia 2017');
  });
  it('нет ни одного поля — «Без названия»', () => {
    expect(formatCarTitle({ make: null, model: null, year: null })).toBe('Без названия');
    expect(formatCarTitle({ make: '', model: null, year: null })).toBe('Без названия');
  });
});

describe('shortId', () => {
  it('первые 8 символов UUID', () => {
    expect(shortId('00000000-0000-4000-8000-000000000103')).toBe('00000000');
    expect(shortId('3c4d5e6f-aaaa-bbbb-cccc-dddddddddddd')).toBe('3c4d5e6f');
  });
});
