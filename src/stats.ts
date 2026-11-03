import type { ChartDatum } from './chart';
import { shiftMonth } from './dates';
import { shiftDays, weekStart } from './volume';
import type { Workout, WorkoutSet } from './db';

export interface MonthStats {
  count: number;
  sets: number;
  tonnage: number;
  durationMin: number;
  byType: [string, number][];
}

// Сумма вес × повторения по рабочим подходам. Упражнения со своим весом дают ноль.
export function tonnage(sets: WorkoutSet[]): number {
  return sets
    .filter((set) => !set.warmup)
    .reduce((sum, set) => sum + set.weight * set.reps, 0);
}

function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// Итоги за несколько месяцев подряд, последний из них — выбранный
export function monthStats(workouts: Workout[], year: number, month: number, months = 1): MonthStats {
  const prefixes = Array.from({ length: months }, (_, index) => {
    const shown = shiftMonth(year, month, -index);
    return monthPrefix(shown.year, shown.month);
  });
  const inMonth = workouts.filter((workout) => prefixes.includes(workout.date.slice(0, 7)));
  const sets = inMonth.flatMap((workout) => workout.exercises).flatMap((item) => item.sets);

  const byType = new Map<string, number>();
  for (const workout of inMonth) {
    byType.set(workout.type, (byType.get(workout.type) ?? 0) + 1);
  }

  return {
    count: inMonth.length,
    sets: sets.filter((set) => !set.warmup).length,
    tonnage: tonnage(sets),
    durationMin: inMonth.reduce((sum, workout) => sum + (workout.durationMin ?? 0), 0),
    byType: [...byType],
  };
}

// Тоннаж по месяцам, включая выбранный. Дата точки — первое число месяца.
export function monthlyTonnage(workouts: Workout[], year: number, month: number, months: number): ChartDatum[] {
  return Array.from({ length: months }, (_, index) => {
    const shown = shiftMonth(year, month, index - months + 1);
    return {
      date: `${monthPrefix(shown.year, shown.month)}-01`,
      value: monthStats(workouts, shown.year, shown.month).tonnage,
    };
  });
}

export interface CountBucket {
  start: string;
  end: string;
  count: number;
}

// Сколько тренировок было в каждую неделю (с понедельника) или в каждый месяц периода [from, to].
// Крайние недели обрезаются по границам периода.
export function workoutCounts(workouts: Workout[], from: string, to: string, by: 'week' | 'month'): CountBucket[] {
  return periodBuckets(workouts, from, to, by).map(({ start, end, workouts: inBucket }) => ({
    start,
    end,
    count: inBucket.length,
  }));
}

// Тренировки, разложенные по неделям (с понедельника) или месяцам периода [from, to]
export function periodBuckets(
  workouts: Workout[],
  from: string,
  to: string,
  by: 'week' | 'month',
): { start: string; end: string; workouts: Workout[] }[] {
  const buckets: { start: string; end: string; workouts: Workout[] }[] = [];
  let start = by === 'week' ? weekStart(from) : `${from.slice(0, 7)}-01`;
  while (start <= to) {
    const nextMonth = shiftMonth(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, 1);
    const next = by === 'week' ? shiftDays(start, 7) : `${monthPrefix(nextMonth.year, nextMonth.month)}-01`;
    const end = shiftDays(next, -1) < to ? shiftDays(next, -1) : to;
    const first = start < from ? from : start;
    buckets.push({
      start: first,
      end,
      workouts: workouts.filter((workout) => workout.date >= first && workout.date <= end),
    });
    start = next;
  }
  return buckets;
}

export function averageRating(workouts: Workout[]): number | undefined {
  const ratings = workouts.flatMap((workout) => workout.rating ?? []);
  return ratings.length > 0
    ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
    : undefined;
}

// Тип «Другое» всегда внизу списка, остальные по убыванию
export function sortTypes(byType: [string, number][]): [string, number][] {
  return [...byType].sort((a, b) => Number(a[0] === 'other') - Number(b[0] === 'other') || b[1] - a[1]);
}

// Доля цели для полосы прогресса: от 0 до 100
export function goalPercent(count: number, goal: number): number {
  return goal > 0 ? Math.min(100, Math.round((count / goal) * 100)) : 0;
}
