// Расчеты по шагам: периоды, итоги, средние по месяцам. Сами шаги приходят из Health Connect (native.ts)
export type StepsPeriod = 'week' | 'month' | 'year';

export interface DaySteps {
  date: string; // ГГГГ-ММ-ДД
  steps: number;
}

export const DEFAULT_STEP_GOAL = 10000;

const toDate = (date: string): Date => new Date(`${date}T00:00:00`);
const toText = (date: Date): string => date.toLocaleDateString('sv-SE');

export function addDays(date: string, days: number): string {
  const value = toDate(date);
  value.setDate(value.getDate() + days);
  return toText(value);
}

// Первый и последний день периода; offset -1 — прошлая неделя/месяц/год. Неделя с понедельника.
export function periodRange(kind: StepsPeriod, offset: number, today: string): { from: string; to: string } {
  const now = toDate(today);
  if (kind === 'week') {
    const monday = addDays(today, -((now.getDay() + 6) % 7) + offset * 7);
    return { from: monday, to: addDays(monday, 6) };
  }
  if (kind === 'month') {
    return {
      from: toText(new Date(now.getFullYear(), now.getMonth() + offset, 1)),
      to: toText(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)),
    };
  }
  const year = now.getFullYear() + offset;
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

// Каждый день периода по порядку; дни без данных — 0 шагов
export function fillDays(from: string, to: string, samples: DaySteps[]): DaySteps[] {
  const byDate = new Map<string, number>();
  for (const item of samples) byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.steps);
  const days: DaySteps[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) days.push({ date, steps: byDate.get(date) ?? 0 });
  return days;
}

// Итоги: будущие дни не считаются, иначе среднее текущей недели занижено
export function stepsSummary(days: DaySteps[], goal: number, today: string) {
  const past = days.filter((day) => day.date <= today);
  const total = past.reduce((sum, day) => sum + day.steps, 0);
  const best = past.reduce<DaySteps | undefined>((top, day) => (day.steps > (top?.steps ?? 0) ? day : top), undefined);
  return {
    total,
    average: past.length ? Math.round(total / past.length) : 0,
    daysMet: past.filter((day) => day.steps >= goal).length,
    best,
  };
}

// Для года: среднее шагов в день по каждому месяцу (0..11), будущие дни не считаются
export function monthlyAverages(days: DaySteps[], today: string): number[] {
  return Array.from({ length: 12 }, (_, month) => {
    const inMonth = days.filter((day) => day.date <= today && Number(day.date.slice(5, 7)) === month + 1);
    return inMonth.length ? Math.round(inMonth.reduce((sum, day) => sum + day.steps, 0) / inMonth.length) : 0;
  });
}

// Подпись над столбцом: 8 234 → «8,2k», 10 000 → «10k»
export function compactSteps(steps: number): string {
  if (steps < 1000) return String(steps);
  const thousands = Math.round(steps / 100) / 10;
  return `${String(thousands).replace('.', ',')}k`;
}
