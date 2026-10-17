const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'always', style: 'long' });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * «5 минут назад», «3 часа назад», «2 дня назад», «1 месяц назад». Для даты из будущего (часы клиента отстают от сервера)
 * возвращает «только что»: «через 2 минуты» для очереди модерации выглядело бы странно.
 */
export function formatRelativeTime(value: string | Date, now: Date | number = Date.now()): string {
  const time = (typeof value === 'string' ? new Date(value) : value).getTime();
  if (Number.isNaN(time)) return '—';
  const diff = (typeof now === 'number' ? now : now.getTime()) - time;

  if (diff < MINUTE) return 'только что';
  if (diff < HOUR) return rtf.format(-Math.floor(diff / MINUTE), 'minute');
  if (diff < DAY) return rtf.format(-Math.floor(diff / HOUR), 'hour');
  if (diff < 30 * DAY) return rtf.format(-Math.floor(diff / DAY), 'day');
  if (diff < 365 * DAY) return rtf.format(-Math.floor(diff / (30 * DAY)), 'month');
  return rtf.format(-Math.floor(diff / (365 * DAY)), 'year');
}

const fullDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** «27 сентября 2026 г., 08:12» — для подсказки по наведению, когда нужна точная дата. */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '—' : fullDate.format(date);
}

/** Название машины для списков: «Volkswagen Passat 2017». Нет ни одного поля — «Без названия». */
export function formatCarTitle(car: { make: string | null; model: string | null; year: number | null }): string {
  const title = [car.make, car.model, car.year].filter((part) => part !== null && part !== '').join(' ');
  return title || 'Без названия';
}

/** UUID подборщика, сокращённый до 8 символов, пока бэкенд не отдаёт имя (BE-3, ADM-12). */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
