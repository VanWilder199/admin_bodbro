import { describe, expect, it } from 'vitest';
import { formatPeriod, formatStamp, totalKopecks } from './format';

describe('totalKopecks', () => {
  it('складывает копейки как целые числа', () => {
    expect(totalKopecks([{ amountByn: 125_000 }, { amountByn: 48_750 }])).toBe(173_750);
  });

  it('не накапливает ошибку дробей: 10 + 20 копеек ровно 30', () => {
    expect(totalKopecks([{ amountByn: 10 }, { amountByn: 20 }])).toBe(30);
    // а вот рубли с плавающей точкой дали бы 0.30000000000000004
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('пустой список — ноль', () => {
    expect(totalKopecks([])).toBe(0);
  });
});

describe('formatPeriod', () => {
  it('календарный месяц — «август 2026», время запуска планировщика не показывается', () => {
    expect(formatPeriod('2026-08-01T00:00:00.012Z', '2026-08-31T00:00:00.012Z')).toBe('август 2026');
  });

  it('1-е число не превращается в 31-е при любой зоне админа: считаем в UTC', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(formatPeriod('2026-09-01T00:00:00Z', '2026-09-30T23:59:59Z')).toBe('сентябрь 2026');
    } finally {
      process.env.TZ = original;
    }
  });

  it('период из нескольких месяцев показывается датами', () => {
    expect(formatPeriod('2026-07-01T00:00:00Z', '2026-08-31T00:00:00Z')).toMatch(/1 июл\.? 2026.*31 авг\.? 2026/);
  });

  it('невалидная дата — прочерк', () => {
    expect(formatPeriod('x', '2026-08-31T00:00:00Z')).toBe('—');
  });
});

describe('formatStamp', () => {
  it('нет даты (батч ещё не оплачен) — прочерк', () => {
    expect(formatStamp(null)).toBe('—');
    expect(formatStamp('не дата')).toBe('—');
  });

  it('дата и время', () => {
    expect(formatStamp('2026-09-03T09:30:00Z')).toMatch(/3 сент\.? 2026/);
  });
});
