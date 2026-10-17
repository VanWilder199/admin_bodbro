import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_TO, resolveReturnTo, safeReturnTo } from './returnTo';

describe('safeReturnTo — защита от open redirect', () => {
  it.each([
    ['/moderation', '/moderation'],
    ['/reports/5b1c2f9e', '/reports/5b1c2f9e'],
    ['/inspectors?status=pending', '/inspectors?status=pending'],
    ['/reports/1#history', '/reports/1#history'],
  ])('относительный путь %s принимается', (raw, expected) => {
    expect(safeReturnTo(raw)).toBe(expected);
  });

  it.each([
    'https://evil.com',
    'http://evil.com/moderation',
    '//evil.com',
    '//evil.com/moderation',
    '/\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    'javascript:alert(1)',
    'evil.com',
    'moderation',
    '',
  ])('%j отклоняется', (raw) => {
    expect(safeReturnTo(raw)).toBeNull();
  });

  it('null и undefined отклоняются', () => {
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
  });

  it('на экраны входа возвращать нельзя: получился бы цикл', () => {
    expect(safeReturnTo('/login')).toBeNull();
    expect(safeReturnTo('/login?returnTo=%2Fmoderation')).toBeNull();
    expect(safeReturnTo('/setup-totp')).toBeNull();
  });

  it('путь, который только начинается как /login, допустим', () => {
    expect(safeReturnTo('/login-history')).toBe('/login-history');
  });
});

describe('resolveReturnTo', () => {
  it('небезопасное или пустое значение → /moderation', () => {
    expect(resolveReturnTo('https://evil.com')).toBe(DEFAULT_RETURN_TO);
    expect(resolveReturnTo(null)).toBe('/moderation');
  });

  it('безопасное значение сохраняется', () => {
    expect(resolveReturnTo('/payouts?status=pending')).toBe('/payouts?status=pending');
  });
});
