import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, readDraft, writeDraft } from './draft';
import { pickNextReportId } from './nextInQueue';
import { appendTemplate, DELETE_CONFIRM_WORD, isDeleteConfirmed, isReasonValid, REASON_MAX, REASON_MIN, reasonHint, REVISE_TEMPLATES } from './reason';

describe('причина: границы длины', () => {
  it('короче 10 символов после trim — невалидна, ровно 10 — валидна', () => {
    expect(isReasonValid('a'.repeat(REASON_MIN - 1))).toBe(false);
    expect(isReasonValid('a'.repeat(REASON_MIN))).toBe(true);
  });

  it('пробелы по краям не засчитываются в длину', () => {
    expect(isReasonValid(`   ${'a'.repeat(REASON_MIN - 1)}   `)).toBe(false);
    expect(isReasonValid(`   ${'a'.repeat(REASON_MIN)}   `)).toBe(true);
  });

  it('пустая и состоящая из пробелов — невалидна', () => {
    expect(isReasonValid('')).toBe(false);
    expect(isReasonValid('          ')).toBe(false);
  });

  it('длиннее 2000 — невалидна, ровно 2000 — валидна', () => {
    expect(isReasonValid('a'.repeat(REASON_MAX))).toBe(true);
    expect(isReasonValid('a'.repeat(REASON_MAX + 1))).toBe(false);
  });

  it('подсказка: пустое поле не ругается, короткое и длинное — по-разному', () => {
    expect(reasonHint('')).toBeNull();
    expect(reasonHint('   ')).toBeNull();
    expect(reasonHint('коротко')).toMatch(/не меньше 10/);
    expect(reasonHint('a'.repeat(REASON_MAX + 1))).toMatch(/не больше 2000/);
    expect(reasonHint('нормальная причина')).toBeNull();
  });
});

describe('шаблоны причин', () => {
  it('в пустое поле вставляется как есть', () => {
    expect(appendTemplate('', 'Нет фото VIN')).toBe('Нет фото VIN');
  });

  it('к написанному дописывается с новой строки, написанное не теряется', () => {
    expect(appendTemplate('Своя причина.  ', 'Нет фото VIN')).toBe('Своя причина.\nНет фото VIN');
  });

  it('итог не длиннее 2000 символов', () => {
    expect(appendTemplate('a'.repeat(1995), 'b'.repeat(50))).toHaveLength(REASON_MAX);
  });

  it('все шаблоны сами проходят проверку длины', () => {
    for (const template of REVISE_TEMPLATES) expect(isReasonValid(template.text)).toBe(true);
    expect(REVISE_TEMPLATES.map((t) => t.label)).toEqual(['Нет фото VIN', 'Размытые фото', 'Нет видео обхода']);
  });
});

describe('подтверждение удаления', () => {
  it.each(['УДАЛИТЬ', 'удалить', '  Удалить  '])('«%s» принимается', (input) => {
    expect(isDeleteConfirmed(input)).toBe(true);
  });

  it.each(['', 'УДАЛИТ', 'УДАЛИТЬ!', 'DELETE', 'УДАЛИТЬ УДАЛИТЬ'])('«%s» не принимается', (input) => {
    expect(isDeleteConfirmed(input)).toBe(false);
  });

  it('латинские буквы, похожие на кириллические, не принимаются', () => {
    // «УДАЛИТЬ» с латинскими A и E внутри — внешне не отличить, но это не то слово
    expect(isDeleteConfirmed('УДAЛИТЬ')).toBe(false);
    expect(DELETE_CONFIRM_WORD).toBe('УДАЛИТЬ');
  });
});

describe('черновики причин', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('пишутся по ключу draft:<действие>:<id> и читаются обратно', () => {
    writeDraft('revise', 'r1', 'нет фото VIN');
    expect(sessionStorage.getItem('draft:revise:r1')).toBe('нет фото VIN');
    expect(readDraft('revise', 'r1')).toBe('нет фото VIN');
  });

  it('черновики разных действий и отчётов не смешиваются', () => {
    writeDraft('revise', 'r1', 'a');
    writeDraft('delete', 'r1', 'b');
    writeDraft('revise', 'r2', 'c');
    expect([readDraft('revise', 'r1'), readDraft('delete', 'r1'), readDraft('revise', 'r2')]).toEqual(['a', 'b', 'c']);
  });

  it('пустой текст и clearDraft удаляют запись', () => {
    writeDraft('revise', 'r1', 'текст');
    writeDraft('revise', 'r1', '');
    expect(sessionStorage.getItem('draft:revise:r1')).toBeNull();

    writeDraft('delete', 'r1', 'текст');
    clearDraft('delete', 'r1');
    expect(readDraft('delete', 'r1')).toBe('');
  });

  it('недоступное хранилище не роняет страницу', () => {
    // подменяем сам объект: в happy-dom методы Storage через prototype не перехватываются
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    vi.stubGlobal('sessionStorage', broken);
    expect(() => writeDraft('revise', 'r1', 'x')).not.toThrow();
    expect(() => writeDraft('revise', 'r1', '')).not.toThrow();
    expect(readDraft('revise', 'r1')).toBe('');
  });
});

describe('pickNextReportId', () => {
  it('следующий после текущего в порядке очереди', () => {
    expect(pickNextReportId(['a', 'b', 'c'], ['b', 'c'], 'a')).toBe('b');
    expect(pickNextReportId(['a', 'b', 'c'], ['a', 'c'], 'b')).toBe('c');
  });

  it('текущий был последним — берётся самый старый из оставшихся', () => {
    expect(pickNextReportId(['a', 'b', 'c'], ['a', 'b'], 'c')).toBe('a');
  });

  it('следующий уже разобрали в другой вкладке — пропускается', () => {
    expect(pickNextReportId(['a', 'b', 'c'], ['c'], 'a')).toBe('c');
  });

  it('текущий отчёт всё ещё в свежей очереди (сервер не успел убрать) — не выбирается', () => {
    expect(pickNextReportId(['a', 'b'], ['a', 'b'], 'a')).toBe('b');
  });

  it('очередь опустела — null', () => {
    expect(pickNextReportId(['a'], [], 'a')).toBeNull();
    expect(pickNextReportId(['a'], ['a'], 'a')).toBeNull();
  });

  it('текущего не было в старой очереди (открыли по прямой ссылке) — первый из свежей', () => {
    expect(pickNextReportId([], ['x', 'y'], 'z')).toBe('x');
  });

  it('новые отчёты, появившиеся за время решения, тоже годятся', () => {
    expect(pickNextReportId(['a'], ['new'], 'a')).toBe('new');
  });
});
