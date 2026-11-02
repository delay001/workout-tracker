import type { ChartDatum } from './chart';
import { shiftMonth } from './dates';
import type { Workout, WorkoutSet } from './db';
import { bestSet, type LastPerformance } from './workouts';

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

export function monthStats(workouts: Workout[], year: number, month: number): MonthStats {
  const prefix = monthPrefix(year, month);
  const inMonth = workouts.filter((workout) => workout.date.startsWith(prefix));
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

// Лучший вес за каждый день, от старых записей к новым
export function exerciseProgress(history: LastPerformance[]): ChartDatum[] {
  const byDate = new Map<string, number>();
  for (const entry of [...history].reverse()) {
    const peak = bestSet(entry.sets)?.weight ?? 0;
    byDate.set(entry.date, Math.max(byDate.get(entry.date) ?? 0, peak));
  }
  return [...byDate].map(([date, value]) => ({ date, value }));
}

// Доля цели для полосы прогресса: от 0 до 100
export function goalPercent(count: number, goal: number): number {
  return goal > 0 ? Math.min(100, Math.round((count / goal) * 100)) : 0;
}
