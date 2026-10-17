import { describe, expect, it } from 'vitest';
import { isNavActive, NAV_ITEMS, titleForPath, visibleNavItems } from './navItems';

const item = (to: string) => NAV_ITEMS.find((i) => i.to === to)!;

describe('visibleNavItems', () => {
  it('пока нет бэкенда, «Дашборд», «Отчёты» и «Покупки» скрыты флагами', () => {
    expect(visibleNavItems().map((i) => i.label)).toEqual(['Модерация', 'Подборщики', 'Выплаты']);
  });

  it('включённый флаг возвращает пункт на своё место в меню', () => {
    const all = { dashboard: true, reports: true, purchases: true };
    expect(visibleNavItems(all).map((i) => i.label)).toEqual(['Дашборд', 'Модерация', 'Отчёты', 'Подборщики', 'Выплаты', 'Покупки']);
  });

  it('каждый флаг убирает только свой пункт', () => {
    expect(visibleNavItems({ dashboard: false, reports: true, purchases: false }).map((i) => i.label)).toEqual(['Модерация', 'Отчёты', 'Подборщики', 'Выплаты']);
  });

  it('дашборд подсвечен только на «/», а не на всех путях', () => {
    expect(isNavActive('/', item('/'))).toBe(true);
    expect(isNavActive('/moderation', item('/'))).toBe(false);
  });
});

describe('isNavActive', () => {
  it('точный путь и вложенные пути подсвечивают пункт', () => {
    expect(isNavActive('/payouts', item('/payouts'))).toBe(true);
    expect(isNavActive('/payouts/abc', item('/payouts'))).toBe(true);
  });

  it('карточка отчёта относится к модерации', () => {
    expect(isNavActive('/reports/5b1c', item('/moderation'))).toBe(true);
    expect(isNavActive('/reports/5b1c', item('/inspectors'))).toBe(false);
  });

  it('совпадение только по границе сегмента: /payouts-old — не «Выплаты»', () => {
    expect(isNavActive('/payouts-old', item('/payouts'))).toBe(false);
  });

  it('реестр отчётов (/reports) не подсвечивает «Модерацию»', () => {
    expect(isNavActive('/reports', item('/moderation'))).toBe(false);
    expect(isNavActive('/reports', item('/reports'))).toBe(true);
  });
});

describe('titleForPath', () => {
  it('берёт название пункта меню', () => {
    expect(titleForPath('/inspectors')).toBe('Подборщики');
    expect(titleForPath('/reports/5b1c')).toBe('Модерация');
  });

  it('для неизвестного пути — null', () => {
    expect(titleForPath('/nowhere')).toBeNull();
  });
});
