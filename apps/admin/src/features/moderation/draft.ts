/*
 * Черновики причин в sessionStorage по ключу `draft:<действие>:<id>` (PLAN_FRONTEND_ADMIN.md, 3.1).
 * Зачем: пока админ писал причину, могла истечь сессия. После повторного входа он вернётся на тот же отчёт,
 * и написанное не должно пропасть. sessionStorage живёт, пока открыта вкладка, и не очищается при выходе из админки.
 * Ключ единый для revise, delete и (в ADM-09) ban.
 */

export type DraftAction = 'revise' | 'delete' | 'ban' | 'revoke';

const draftKey = (action: DraftAction, id: string) => `draft:${action}:${id}`;

export function readDraft(action: DraftAction, id: string): string {
  try {
    return sessionStorage.getItem(draftKey(action, id)) ?? '';
  } catch {
    return ''; // хранилище недоступно — черновика просто нет
  }
}

/** Пустой текст удаляет запись: не копим в хранилище пустые ключи. */
export function writeDraft(action: DraftAction, id: string, text: string): void {
  try {
    if (text === '') sessionStorage.removeItem(draftKey(action, id));
    else sessionStorage.setItem(draftKey(action, id), text);
  } catch {
    // переполнено или запрещено: теряем только страховку, не работу
  }
}

export function clearDraft(action: DraftAction, id: string): void {
  writeDraft(action, id, '');
}
