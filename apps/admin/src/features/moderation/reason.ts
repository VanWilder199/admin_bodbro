/*
 * Причины для revise и delete. Бэкенд проверяет только @NotBlank, а текст уходит подборщику в письме дословно,
 * поэтому границы длины держит фронт (PLAN_FRONTEND_ADMIN.md, 3.4).
 */

export const REASON_MIN = 10;
export const REASON_MAX = 2000;

/** Слово, которое нужно ввести для удаления. Кириллица: латинская «A» вместо «А» не подойдёт — это намеренно. */
export const DELETE_CONFIRM_WORD = 'УДАЛИТЬ';

export interface ReasonTemplate {
  label: string;
  text: string;
}

/** Быстрые причины для возврата на доработку: вставляются в поле и дописываются, а не заменяют написанное. */
export const REVISE_TEMPLATES: readonly ReasonTemplate[] = [
  { label: 'Нет фото VIN', text: 'Нет фото VIN-таблички: добавьте чёткое фото и отправьте отчёт повторно.' },
  { label: 'Размытые фото', text: 'Часть фото размыта: переснимите их при хорошем освещении.' },
  { label: 'Нет видео обхода', text: 'Нет видео обхода автомобиля: добавьте видео и отправьте отчёт повторно.' },
];

/** Причина годится к отправке: после `trim` не короче и не длиннее границ. */
export function isReasonValid(text: string): boolean {
  const length = text.trim().length;
  return length >= REASON_MIN && length <= REASON_MAX;
}

/**
 * Подсказка об ошибке под полем. Пустое поле ошибкой не считается — пока админ ничего не ввёл,
 * ругаться рано; кнопка при этом всё равно неактивна.
 */
export function reasonHint(text: string): string | null {
  const length = text.trim().length;
  if (length === 0) return null;
  if (length < REASON_MIN) return `Слишком коротко: нужно не меньше ${REASON_MIN} символов`;
  if (length > REASON_MAX) return `Слишком длинно: не больше ${REASON_MAX} символов`;
  return null;
}

/** Дописать шаблон с новой строки; в пустое поле — просто вставить. Итог не длиннее `REASON_MAX`. */
export function appendTemplate(current: string, template: string): string {
  const base = current.trimEnd();
  const next = base ? `${base}\n${template}` : template;
  return next.slice(0, REASON_MAX);
}

/** Слово подтверждения: регистр и пробелы по краям не важны, само слово — важно. */
export function isDeleteConfirmed(input: string): boolean {
  return input.trim().toUpperCase() === DELETE_CONFIRM_WORD;
}
