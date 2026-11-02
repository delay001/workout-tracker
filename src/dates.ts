import { LOCALE } from './i18n';

// Сегодняшняя дата в виде ГГГГ-ММ-ДД. Шведский формат даты совпадает с ним.
export function todayLocal(): string {
  return new Date().toLocaleDateString('sv-SE');
}

export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(LOCALE);
}

export function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

export function formatMonth(year: number, month: number): string {
  const name = new Date(year, month, 1).toLocaleDateString(LOCALE, { month: 'long' });
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

// Клетки календаря за месяц (месяц с нуля). Неделя начинается с понедельника,
// null — пустая клетка перед первым числом.
export function monthCells(year: number, month: number): (string | null)[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;

  return [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: days }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`),
  ];
}
