import type { BodyWeight, Exercise, Workout } from './db';
import { oneRepMaxSeries, historyRecords } from './progress';
import { tonnage } from './stats';
import type { LastPerformance } from './workouts';

export interface YearSummary {
  year: number;
  workouts: number;
  hours: number;
  tonnage: number;
  favourite?: string;
  biggestGain?: { name: string; kg: number };
  records: number;
  weightChange?: number;
  bestMonth?: { month: number; workouts: number };
  upper: number;
  lower: number;
}

// Итоги доступны с 15 декабря до конца января, прошлые годы — всегда
export function availableYears(years: number[], today: string): number[] {
  const year = Number(today.slice(0, 4));
  const inSeason = today.slice(5) >= '12-15';
  return years.filter((item) => item < year || (item === year && inSeason)).sort((a, b) => b - a);
}

export function yearSummary(
  allWorkouts: Workout[],
  exercises: Exercise[],
  weights: BodyWeight[],
  year: number,
): YearSummary {
  const workouts = allWorkouts.filter((workout) => workout.date.startsWith(String(year)));
  const histories = new Map<number, LastPerformance[]>();
  const monthCounts = new Map<number, number>();
  for (const workout of workouts) {
    const month = Number(workout.date.slice(5, 7)) - 1;
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    for (const item of workout.exercises) {
      histories.set(item.exerciseId, [
        ...(histories.get(item.exerciseId) ?? []),
        { date: workout.date, sets: item.sets },
      ]);
    }
  }

  const name = (id: number): string => exercises.find((exercise) => exercise.id === id)?.name ?? '';
  const favourite = [...histories].sort((a, b) => b[1].length - a[1].length)[0];

  const gains = [...histories].flatMap(([id, history]) => {
    const series = oneRepMaxSeries(history);
    return series.length > 1 ? [{ name: name(id), kg: series[series.length - 1].value - series[0].value }] : [];
  });
  const biggestGain = gains.sort((a, b) => b.kg - a.kg)[0];

  const yearWeights = weights.filter((item) => item.date.startsWith(String(year)));
  const best = [...monthCounts].sort((a, b) => b[1] - a[1])[0];

  return {
    year,
    workouts: workouts.length,
    hours: Math.round(workouts.reduce((sum, workout) => sum + (workout.durationMin ?? 0), 0) / 60),
    tonnage: tonnage(workouts.flatMap((workout) => workout.exercises).flatMap((item) => item.sets)),
    favourite: favourite && name(favourite[0]),
    biggestGain: biggestGain && biggestGain.kg > 0 ? { ...biggestGain, kg: Math.round(biggestGain.kg * 10) / 10 } : undefined,
    records: [...histories.values()].flatMap((history) => historyRecords(history).flat()).filter(Boolean).length,
    weightChange:
      yearWeights.length > 1
        ? Math.round((yearWeights[yearWeights.length - 1].kg - yearWeights[0].kg) * 10) / 10
        : undefined,
    bestMonth: best ? { month: best[0], workouts: best[1] } : undefined,
    upper: workouts.filter((workout) => workout.type === 'upper').length,
    lower: workouts.filter((workout) => workout.type === 'lower').length,
  };
}
