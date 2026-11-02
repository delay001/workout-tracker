import { db, saveWorkout, type Exercise, type Workout, type WorkoutSet, type WorkoutType } from './db';

export const WORKOUT_TYPE_NAMES: Record<WorkoutType, string> = {
  upper: 'Верх',
  lower: 'Низ',
  other: 'Другое',
};

export async function getActiveWorkout(): Promise<Workout | undefined> {
  return db.workouts.where('status').equals('active').first();
}

export async function startWorkout(date: string, type: WorkoutType): Promise<void> {
  await saveWorkout({ date, type, status: 'active', exercises: [] });
}

export async function searchExercises(query: string): Promise<Exercise[]> {
  const key = query.trim().toLowerCase();
  const exercises = await db.exercises.toArray();
  return exercises
    .filter((exercise) => exercise.nameKey.includes(key))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export async function addExerciseToWorkout(workout: Workout, exerciseId: number): Promise<void> {
  if (workout.exercises.some((item) => item.exerciseId === exerciseId)) {
    return;
  }
  await saveWorkout({ ...workout, exercises: [...workout.exercises, { exerciseId, sets: [] }] });
}

export async function addSet(workout: Workout, exerciseId: number, set: WorkoutSet): Promise<void> {
  const exercises = workout.exercises.map((item) =>
    item.exerciseId === exerciseId ? { ...item, sets: [...item.sets, set] } : item,
  );
  await saveWorkout({ ...workout, exercises });
}

export async function removeSet(workout: Workout, exerciseId: number, setIndex: number): Promise<void> {
  const exercises = workout.exercises.map((item) =>
    item.exerciseId === exerciseId
      ? { ...item, sets: item.sets.filter((_, index) => index !== setIndex) }
      : item,
  );
  await saveWorkout({ ...workout, exercises });
}

// Упражнения без подходов не сохраняются. Тренировка без подходов удаляется, тогда вернётся false.
export async function finishWorkout(
  workout: Workout,
  details: { durationMin?: number; note?: string },
): Promise<boolean> {
  const exercises = workout.exercises.filter((item) => item.sets.length > 0);
  if (exercises.length === 0) {
    await db.workouts.delete(workout.id);
    return false;
  }

  await saveWorkout({ ...workout, ...details, status: 'finished', exercises });
  return true;
}

export function parseSet(weightText: string, repsText: string, warmup: boolean): WorkoutSet {
  const weight = Number(weightText.replace(',', '.'));
  const reps = Number(repsText);

  if (weightText.trim() === '' || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(weight * 2)) {
    throw new Error('Вес: число с шагом 0.5 кг');
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error('Повторения: целое число больше нуля');
  }

  return { weight, reps, warmup };
}

export function parseDuration(text: string): number | undefined {
  if (text.trim() === '') {
    return undefined;
  }
  const minutes = Number(text);
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error('Длительность: целое число минут');
  }
  return minutes;
}
