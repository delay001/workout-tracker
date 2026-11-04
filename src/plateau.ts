import type { Exercise, Workout } from './db';
import type { Muscle } from './muscles';
import { daysBetween } from './progress';
import { muscleVolume, shiftDays } from './volume';
import { oneRepMax } from './workouts';

// Плато: нет нового рекорда расчетного 1ПМ столько дней, хотя упражнение делалось хотя бы столько раз
export const PLATEAU_DAYS = 28;
export const PLATEAU_MIN_TIMES = 3;
// Упражнение, которое давно не делалось, — это не плато, его показывает «Давно не делал»
const STILL_DOING_DAYS = 14;

export interface Plateau {
  exerciseId: number;
  // Дата последнего рекорда: после нее результат не рос
  since: string;
  days: number;
  times: number;
  // Лучший расчетный 1ПМ, кг
  best: number;
}

// Тренировки должны быть завершенными. Сначала самые долгие плато.
export function findPlateaus(workouts: Workout[], today: string): Plateau[] {
  const days = new Map<number, Map<string, number>>();
  for (const workout of workouts) {
    for (const item of workout.exercises) {
      const values = item.sets.filter((set) => !set.warmup).flatMap((set) => oneRepMax(set) ?? []);
      if (values.length === 0) continue;
      const byDate = days.get(item.exerciseId) ?? new Map<string, number>();
      byDate.set(workout.date, Math.max(byDate.get(workout.date) ?? 0, ...values));
      days.set(item.exerciseId, byDate);
    }
  }

  const result: Plateau[] = [];
  for (const [exerciseId, byDate] of days) {
    const dates = [...byDate.keys()].sort();
    let best = 0;
    let since = dates[0];
    for (const date of dates) {
      if (byDate.get(date)! > best) {
        best = byDate.get(date)!;
        since = date;
      }
    }
    const times = dates.filter((date) => date > since).length;
    const stalled = daysBetween(since, today);
    if (stalled >= PLATEAU_DAYS && times >= PLATEAU_MIN_TIMES && daysBetween(dates.at(-1)!, today) <= STILL_DOING_DAYS) {
      result.push({ exerciseId, since, days: stalled, times, best: Math.round(best * 10) / 10 });
    }
  }
  return result.sort((a, b) => b.days - a.days);
}

export type HintLevel = 'ok' | 'low' | 'high';

export interface PlateauHints {
  muscle?: Muscle;
  // Объем: рабочих подходов в неделю на основную мышцу за последние 4 недели и норма
  weeklySets: number;
  norm?: [number, number];
  volume: HintLevel;
  // Интенсивность: среднее число повторений в рабочем подходе и подходы в отказ за время плато
  averageReps: number;
  failureSets: number;
  workingSets: number;
  intensity: 'ok' | 'light' | 'noFailure';
  // Восстановление: средняя оценка тренировок с этим упражнением во время плато и до него
  ratingNow?: number;
  ratingBefore?: number;
  // Сколько раз в неделю за последние 4 недели тренировалась эта мышца
  perWeek: number;
  recovery: 'ok' | 'ratingDrop' | 'often';
}

const average = (values: number[]): number | undefined =>
  values.length === 0 ? undefined : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;

export function plateauHints(
  plateau: Plateau,
  workouts: Workout[],
  exercises: Exercise[],
  norms: Record<Muscle, [number, number]>,
  today: string,
): PlateauHints {
  const muscle = exercises.find((exercise) => exercise.id === plateau.exerciseId)?.primaryMuscle;
  const monthStart = shiftDays(today, -(PLATEAU_DAYS - 1));
  const weeklySets = muscle ? Math.round((muscleVolume(workouts, exercises, monthStart, today)[muscle] / 4) * 10) / 10 : 0;
  const norm = muscle ? norms[muscle] : undefined;
  const volume: HintLevel = !norm ? 'ok' : weeklySets < norm[0] ? 'low' : weeklySets > norm[1] ? 'high' : 'ok';

  const withExercise = workouts.filter((workout) => workout.exerciseIds.includes(plateau.exerciseId));
  const during = withExercise.filter((workout) => workout.date > plateau.since);
  const sets = during
    .flatMap((workout) => workout.exercises.filter((item) => item.exerciseId === plateau.exerciseId))
    .flatMap((item) => item.sets.filter((set) => !set.warmup));
  const averageReps = average(sets.map((set) => set.reps)) ?? 0;
  const failureSets = sets.filter((set) => set.toFailure).length;
  const intensity = averageReps > 12 ? 'light' : sets.length > 0 && failureSets === 0 ? 'noFailure' : 'ok';

  // Для сравнения оценок берется столько же тренировок до начала плато
  const before = withExercise.filter((workout) => workout.date <= plateau.since).sort((a, b) => b.date.localeCompare(a.date));
  const ratingNow = average(during.flatMap((workout) => workout.rating ?? []));
  const ratingBefore = average(before.slice(0, during.length).flatMap((workout) => workout.rating ?? []));
  const muscleDays = new Set(
    workouts
      .filter((workout) => workout.date >= monthStart && workout.date <= today)
      .filter((workout) =>
        workout.exercises.some((item) => exercises.find((exercise) => exercise.id === item.exerciseId)?.primaryMuscle === muscle),
      )
      .map((workout) => workout.date),
  );
  const perWeek = muscle ? Math.round((muscleDays.size / 4) * 10) / 10 : 0;
  const recovery =
    ratingNow !== undefined && ratingBefore !== undefined && ratingBefore - ratingNow >= 1
      ? 'ratingDrop'
      : perWeek >= 3
        ? 'often'
        : 'ok';

  return { muscle, weeklySets, norm, volume, averageReps, failureSets, workingSets: sets.length, intensity, ratingNow, ratingBefore, perWeek, recovery };
}
