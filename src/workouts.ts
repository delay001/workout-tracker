import { CATALOG, MUSCLE_GROUPS } from './catalog';
import { db, saveWorkout, type Workout, type WorkoutSet, type WorkoutType } from './db';

export const WORKOUT_TYPE_NAMES: Record<WorkoutType, string> = {
  upper: 'Верх',
  lower: 'Низ',
  other: 'Другое',
};

export interface LastPerformance {
  date: string;
  sets: WorkoutSet[];
}

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

// Подходы остаются. Если новое упражнение уже есть в тренировке, подходы дописываются к нему.
export async function replaceExercise(workout: Workout, oldId: number, newId: number): Promise<void> {
  const old = workout.exercises.find((item) => item.exerciseId === oldId);
  if (!old || oldId === newId) {
    return;
  }

  const hasNew = workout.exercises.some((item) => item.exerciseId === newId);
  const exercises = hasNew
    ? workout.exercises
        .filter((item) => item.exerciseId !== oldId)
        .map((item) =>
          item.exerciseId === newId ? { ...item, sets: [...item.sets, ...old.sets] } : item,
        )
    : workout.exercises.map((item) =>
        item.exerciseId === oldId ? { ...item, exerciseId: newId } : item,
      );
  await saveWorkout({ ...workout, exercises });
}

export async function removeExercise(workout: Workout, exerciseId: number): Promise<void> {
  const exercises = workout.exercises.filter((item) => item.exerciseId !== exerciseId);
  await saveWorkout({ ...workout, exercises });
}

// Последняя завершённая тренировка с этим упражнением, не позже даты текущей.
// Так тренировка, внесённая задним числом, сравнивается с тем, что было до неё.
export async function getLastPerformance(
  exerciseId: number,
  workout: Workout,
): Promise<LastPerformance | undefined> {
  const candidates = await db.workouts.where('exerciseIds').equals(exerciseId).toArray();
  const last = candidates
    .filter(
      (item) => item.status === 'finished' && item.id !== workout.id && item.date <= workout.date,
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)[0];
  const sets = last?.exercises.find((item) => item.exerciseId === exerciseId)?.sets;
  return last && sets ? { date: last.date, sets } : undefined;
}

// Что подставить в форму: прошлый подход этой тренировки, иначе первый рабочий из прошлого раза
export function defaultSet(sets: WorkoutSet[], lastSets: WorkoutSet[] = []): WorkoutSet | undefined {
  return sets.at(-1) ?? lastSets.find((set) => !set.warmup) ?? lastSets[0];
}

export async function addSet(workout: Workout, exerciseId: number, set: WorkoutSet): Promise<void> {
  const exercises = workout.exercises.map((item) =>
    item.exerciseId === exerciseId ? { ...item, sets: [...item.sets, set] } : item,
  );
  await saveWorkout({ ...workout, exercises });
}

export async function updateSet(
  workout: Workout,
  exerciseId: number,
  setIndex: number,
  set: WorkoutSet,
): Promise<void> {
  const exercises = workout.exercises.map((item) =>
    item.exerciseId === exerciseId
      ? { ...item, sets: item.sets.map((old, index) => (index === setIndex ? set : old)) }
      : item,
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
  details: { durationMin?: number; rating?: number; note?: string },
): Promise<boolean> {
  const exercises = workout.exercises.filter((item) => item.sets.length > 0);
  if (exercises.length === 0) {
    await db.workouts.delete(workout.id);
    return false;
  }

  await saveWorkout({ ...workout, ...details, status: 'finished', exercises });
  return true;
}

// Новое значение поля после нажатия на плюс или минус
export function stepValue(text: string, delta: number, min: number): string {
  const current = Number(text.replace(',', '.'));
  const base = Number.isFinite(current) ? current : 0;
  return String(Math.max(base + delta, min));
}

export function parseSet(
  weightText: string,
  repsText: string,
  warmup: boolean,
  toFailure = false,
  rirText = '',
): WorkoutSet {
  const weight = Number(weightText.replace(',', '.'));
  const reps = Number(repsText);

  if (weightText.trim() === '' || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(weight * 2)) {
    throw new Error('Вес: число с шагом 0.5 кг');
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error('Повторения: целое число больше нуля');
  }

  const rir = Number(rirText);
  if (!Number.isInteger(rir) || rir < 0) {
    throw new Error('RIR: целое число от нуля');
  }

  return {
    weight,
    reps,
    warmup,
    ...(toFailure ? { toFailure } : {}),
    ...(rirText.trim() === '' ? {} : { rir }),
  };
}

// Время из поля вида 01:20 переводится в минуты
export function parseDuration(text: string): number | undefined {
  if (text === '') {
    return undefined;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  const minutes = match ? Number(match[1]) * 60 + Number(match[2]) : 0;
  if (minutes < 1) {
    throw new Error('Укажи длительность в часах и минутах');
  }
  return minutes;
}
