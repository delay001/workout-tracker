import type { Exercise, Workout } from './db';
import { MUSCLES, type Muscle } from './muscles';
import { daysBetween } from './progress';

export type VolumeStatus = 'none' | 'low' | 'ok' | 'high';

export const DEFAULT_NORMS: Record<Muscle, [number, number]> = {
  chest: [10, 20],
  lats: [10, 20],
  traps: [6, 16],
  frontDelt: [4, 12],
  sideDelt: [8, 20],
  rearDelt: [6, 16],
  biceps: [8, 18],
  triceps: [8, 18],
  forearms: [4, 12],
  quads: [10, 20],
  hamstrings: [8, 16],
  glutes: [6, 16],
  calves: [6, 16],
  abs: [6, 16],
};

export type Volume = Record<Muscle, number>;

export function shiftDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function weekStart(date: string): string {
  return shiftDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}

function emptyVolume(): Volume {
  return Object.fromEntries(MUSCLES.map((muscle) => [muscle, 0])) as Volume;
}

// Подходы по мышцам за дни [from, to]: основная мышца — 1 подход, вспомогательная — 0,5
export function muscleVolume(workouts: Workout[], exercises: Exercise[], from: string, to: string): Volume {
  const volume = emptyVolume();
  for (const workout of workouts.filter((item) => item.date >= from && item.date <= to)) {
    for (const item of workout.exercises) {
      const exercise = exercises.find((candidate) => candidate.id === item.exerciseId);
      const sets = item.sets.filter((set) => !set.warmup && set.minutes === undefined).length;
      if (exercise?.primaryMuscle) {
        volume[exercise.primaryMuscle] += sets;
        for (const muscle of exercise.secondaryMuscles ?? []) {
          volume[muscle] += sets / 2;
        }
      }
    }
  }
  return volume;
}

export function averageVolume(workouts: Workout[], exercises: Exercise[], week: string, weeks: number): Volume {
  const volume = emptyVolume();
  for (let index = 0; index < weeks; index++) {
    const start = shiftDays(week, -7 * index);
    const one = muscleVolume(workouts, exercises, start, shiftDays(start, 6));
    for (const muscle of MUSCLES) {
      volume[muscle] += one[muscle] / weeks;
    }
  }
  return volume;
}

export function pushPull(
  workouts: Workout[],
  exercises: Exercise[],
  from: string,
  to: string,
): { push: number; pull: number } {
  const result = { push: 0, pull: 0 };
  for (const workout of workouts.filter((item) => item.date >= from && item.date <= to)) {
    for (const item of workout.exercises) {
      const movement = exercises.find((candidate) => candidate.id === item.exerciseId)?.movement;
      if (movement === 'push' || movement === 'pull') {
        result[movement] += item.sets.filter((set) => !set.warmup).length;
      }
    }
  }
  return result;
}

export function volumeStatus(sets: number, [min, max]: [number, number]): VolumeStatus {
  if (sets === 0) {
    return 'none';
  }
  if (sets < min) {
    return 'low';
  }
  return sets > max ? 'high' : 'ok';
}

export interface Recommendation {
  muscle: Muscle;
  sets: number;
  min: number;
  exercise?: Exercise;
}

// Мышцы ниже нормы и самое частое упражнение на них из истории
export function recommendations(
  volume: Volume,
  norms: Record<Muscle, [number, number]>,
  workouts: Workout[],
  exercises: Exercise[],
): Recommendation[] {
  return MUSCLES.filter((muscle) => volume[muscle] < norms[muscle][0]).map((muscle) => {
    const candidates = exercises
      .filter((exercise) => exercise.primaryMuscle === muscle && !exercise.hidden)
      .map((exercise) => ({
        exercise,
        count: workouts.filter((workout) => workout.exerciseIds.includes(exercise.id)).length,
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
    return { muscle, sets: volume[muscle], min: norms[muscle][0], exercise: candidates[0]?.exercise };
  });
}

export interface Balance {
  upper: number;
  lower: number;
  warning: 'noLower' | 'ratio' | undefined;
}

// Баланс верх/низ за период и предупреждение: нет низа 14 дней или перекос хуже порога
export function upperLowerBalance(workouts: Workout[], today: string, days: number, maxRatio: number): Balance {
  const inPeriod = workouts.filter((workout) => {
    const age = daysBetween(workout.date, today);
    return age >= 0 && age < days;
  });
  const upper = inPeriod.filter((workout) => workout.type === 'upper').length;
  const lower = inPeriod.filter((workout) => workout.type === 'lower').length;
  const recentLower = workouts.some(
    (workout) => workout.type === 'lower' && daysBetween(workout.date, today) < 14 && workout.date <= today,
  );

  let warning: Balance['warning'];
  if (workouts.length > 0 && !recentLower) {
    warning = 'noLower';
  } else if (Math.max(upper, lower) > maxRatio * Math.max(Math.min(upper, lower), 1)) {
    warning = 'ratio';
  }
  return { upper, lower, warning };
}
