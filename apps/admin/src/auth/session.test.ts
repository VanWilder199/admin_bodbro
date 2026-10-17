import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getSession, getStoredSession, getToken, SESSION_STORAGE_KEY, setSession, updateSessionEmail } from './session';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('session', () => {
  it('expiresIn приходит в секундах, expiresAt хранится в миллисекундах', () => {
    const session = setSession('tok', 86_400, 'a@b.by');
    expect(session.expiresAt).toBe(Date.now() + 86_400_000);
    expect(getSession()).toEqual({ accessToken: 'tok', expiresAt: Date.now() + 86_400_000, email: 'a@b.by' });
    expect(getToken()).toBe('tok');
  });

  it('в хранилище лежат только токен, срок и email — пароля там нет', () => {
    setSession('tok', 60, 'a@b.by');
    const stored = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['accessToken', 'email', 'expiresAt']);
  });

  it('истёкшая сессия: getSession и getToken пусты, getStoredSession ещё видит её', () => {
    setSession('tok', 60, 'a@b.by');
    vi.setSystemTime(Date.now() + 61_000);
    expect(getSession()).toBeNull();
    expect(getToken()).toBeNull();
    expect(getStoredSession()).not.toBeNull();
  });

  it('clearSession удаляет сессию', () => {
    setSession('tok', 60, 'a@b.by');
    clearSession();
    expect(getSession()).toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['битый JSON', '{oops'],
    ['не объект', '"строка"'],
    ['null', 'null'],
    ['нет токена', JSON.stringify({ expiresAt: Date.now() + 1000, email: 'x' })],
    ['пустой токен', JSON.stringify({ accessToken: '', expiresAt: Date.now() + 1000, email: 'x' })],
    ['expiresAt не число', JSON.stringify({ accessToken: 't', expiresAt: 'завтра', email: 'x' })],
  ])('мусор в хранилище (%s) = сессии нет', (_name, raw) => {
    localStorage.setItem(SESSION_STORAGE_KEY, raw);
    expect(getSession()).toBeNull();
    expect(getToken()).toBeNull();
  });

  it('updateSessionEmail меняет только email', () => {
    const before = setSession('tok', 60, 'old@b.by');
    updateSessionEmail('new@b.by');
    expect(getSession()).toEqual({ ...before, email: 'new@b.by' });
  });
});
