import { CATALOG, MUSCLE_GROUPS } from './catalog';
import { db, saveWorkout, type Workout, type WorkoutSet, type WorkoutType } from './db';

export const WORKOUT_TYPE_NAMES: Record<WorkoutType, string> = {
  upper: 'Верх',
  lower: 'Низ',
  other: 'Другое',
};

export interface ExerciseOption {
  name: string;
  muscleGroup?: string;
  // Название и другие его варианты в виде для поиска
  keys: string[];
}

export async function getActiveWorkout(): Promise<Workout | undefined> {
  return db.workouts.where('status').equals('active').first();
}

export async function startWorkout(date: string, type: WorkoutType): Promise<void> {
  await saveWorkout({ date, type, status: 'active', exercises: [] });
}

// «Жим лежа» и «жим лёжа» при поиске считаются одним и тем же
function normalize(text: string): string {
  return text.trim().toLowerCase().replaceAll('ё', 'е');
}

function groupRank(group?: string): number {
  const index = group ? MUSCLE_GROUPS.indexOf(group) : -1;
  return index === -1 ? MUSCLE_GROUPS.length : index;
}

// Упражнения пользователя плюс каталог, без повторов. Каталог в базу не пишется:
// упражнение попадает туда, только когда его выбрали.
export async function searchOptions(query: string): Promise<ExerciseOption[]> {
  const key = normalize(query);
  const saved = await db.exercises.toArray();
  const savedKeys = new Set(saved.map((exercise) => normalize(exercise.name)));
  const aliases = new Map(CATALOG.map((item) => [normalize(item.name), item.aliases ?? []]));

  const options: ExerciseOption[] = [
    ...saved.map((exercise) => ({
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      keys: [exercise.name, ...(aliases.get(normalize(exercise.name)) ?? [])].map(normalize),
    })),
    ...CATALOG.filter((item) => !savedKeys.has(normalize(item.name))).map((item) => ({
      name: item.name,
      muscleGroup: item.group,
      keys: [item.name, ...(item.aliases ?? [])].map(normalize),
    })),
  ];

  return options
    .filter((option) => option.keys.some((optionKey) => optionKey.includes(key)))
    .sort(
      (a, b) =>
        groupRank(a.muscleGroup) - groupRank(b.muscleGroup) || a.name.localeCompare(b.name, 'ru'),
    );
}

export function isExactMatch(options: ExerciseOption[], query: string): boolean {
  const key = normalize(query);
  return options.some((option) => option.keys.includes(key));
}

export async function setMuscleGroup(exerciseId: number, muscleGroup?: string): Promise<void> {
  await db.exercises.update(exerciseId, { muscleGroup });
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
