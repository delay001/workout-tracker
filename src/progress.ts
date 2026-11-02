import type { ChartDatum } from './chart';
import type { Workout, WorkoutSet } from './db';
import { tonnage } from './stats';
import { bestSet, oneRepMax, recordLabels, type LastPerformance } from './workouts';

export type Period = '1m' | '3m' | '1y' | 'all';

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = { '1m': 30, '3m': 91, '1y': 365 };

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime() / DAY_MS;
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function shiftDate(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

export function filterByPeriod(series: ChartDatum[], period: Period, today: string): ChartDatum[] {
  if (period === 'all') {
    return series;
  }
  const start = shiftDate(today, -PERIOD_DAYS[period]);
  return series.filter((point) => point.date >= start);
}

// Одна точка на день: значение по подходам, лучшее или суммарное. От старых записей к новым.
function dailySeries(
  history: LastPerformance[],
  value: (sets: WorkoutSet[]) => number | undefined,
  merge: (a: number, b: number) => number,
): ChartDatum[] {
  const byDate = new Map<string, number>();
  for (const entry of [...history].reverse()) {
    const current = value(entry.sets);
    if (current !== undefined) {
      const old = byDate.get(entry.date);
      byDate.set(entry.date, old === undefined ? current : merge(old, current));
    }
  }
  return [...byDate].map(([date, point]) => ({ date, value: point }));
}

function bestOneRepMax(sets: WorkoutSet[]): number | undefined {
  const values = sets.filter((set) => !set.warmup).flatMap((set) => oneRepMax(set) ?? []);
  return values.length > 0 ? Math.round(Math.max(...values) * 10) / 10 : undefined;
}

export function oneRepMaxSeries(history: LastPerformance[]): ChartDatum[] {
  return dailySeries(history, bestOneRepMax, Math.max);
}

export function workingWeightSeries(history: LastPerformance[]): ChartDatum[] {
  return dailySeries(history, (sets) => bestSet(sets)?.weight, Math.max);
}

export function tonnageSeries(history: LastPerformance[]): ChartDatum[] {
  return dailySeries(history, tonnage, (a, b) => a + b);
}

export interface ExerciseSummary {
  times: number;
  firstDate?: string;
  lastDate?: string;
  bestOneRepMax?: number;
  currentOneRepMax?: number;
  // Текущий 1ПМ в процентах от лучшего за всё время
  fromPeak?: number;
  maxTonnage: number;
}

export function exerciseSummary(history: LastPerformance[], today: string): ExerciseSummary {
  const series = oneRepMaxSeries(history);
  const recentStart = shiftDate(today, -28);
  const recent = series.filter((point) => point.date >= recentStart).map((point) => point.value);
  const best = series.length > 0 ? Math.max(...series.map((point) => point.value)) : undefined;
  const current = recent.length > 0 ? Math.max(...recent) : undefined;

  return {
    times: history.length,
    firstDate: history.at(-1)?.date,
    lastDate: history[0]?.date,
    bestOneRepMax: best,
    currentOneRepMax: current,
    fromPeak: best !== undefined && current !== undefined ? Math.round((current / best) * 100) : undefined,
    maxTonnage: Math.max(0, ...history.map((entry) => tonnage(entry.sets))),
  };
}

// Подписи рекордов для истории упражнения, в том же порядке, что и записи
export function historyRecords(history: LastPerformance[]): string[][] {
  const seen: WorkoutSet[] = [];
  const labels = [...history].reverse().map((entry) => {
    const entryLabels = recordLabels(entry.sets, seen);
    seen.push(...entry.sets.filter((set) => !set.warmup));
    return entryLabels;
  });
  return labels.reverse();
}

// Давно не выполнявшиеся упражнения, сначала самые старые
export function overdueExercises(
  workouts: Workout[],
  days: number,
  today: string,
): { exerciseId: number; days: number }[] {
  const lastDates = new Map<number, string>();
  for (const workout of workouts) {
    for (const id of workout.exerciseIds) {
      const last = lastDates.get(id);
      if (!last || workout.date > last) {
        lastDates.set(id, workout.date);
      }
    }
  }
  return [...lastDates]
    .map(([exerciseId, date]) => ({ exerciseId, days: daysBetween(date, today) }))
    .filter((item) => item.days >= days)
    .sort((a, b) => b.days - a.days);
}

export interface PeriodTotal {
  workouts: number;
  durationMin: number;
  tonnage: number;
}

function totalFrom(workouts: Workout[], start: string): PeriodTotal {
  const shown = workouts.filter((workout) => workout.date >= start);
  return {
    workouts: shown.length,
    durationMin: shown.reduce((sum, workout) => sum + (workout.durationMin ?? 0), 0),
    tonnage: tonnage(shown.flatMap((workout) => workout.exercises).flatMap((item) => item.sets)),
  };
}

// Итоги текущих недели (с понедельника), месяца и года
export function periodTotals(workouts: Workout[], today: string): Record<'week' | 'month' | 'year', PeriodTotal> {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return {
    week: totalFrom(workouts, shiftDate(today, -weekday)),
    month: totalFrom(workouts, `${today.slice(0, 7)}-01`),
    year: totalFrom(workouts, `${today.slice(0, 4)}-01-01`),
  };
}

export function topExercises(workouts: Workout[], limit: number): { exerciseId: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const workout of workouts) {
    for (const id of workout.exerciseIds) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([exerciseId, count]) => ({ exerciseId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
