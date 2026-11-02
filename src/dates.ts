// Сегодняшняя дата в виде ГГГГ-ММ-ДД. Шведский формат даты совпадает с ним.
export function todayLocal(): string {
  return new Date().toLocaleDateString('sv-SE');
}

export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU');
}
