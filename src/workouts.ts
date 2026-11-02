import { CATALOG, MUSCLE_GROUPS } from './catalog';
import {
  db,
  saveWorkout,
  type Exercise,
  type Workout,
  type WorkoutSet,
  type WorkoutType,
} from './db';

const WORKOUT_TYPE_NAMES: Record<WorkoutType, string> = {
  upper: 'Верх',
  lower: 'Низ',
  other: 'Другое',
};

export function workoutTypeName(type: WorkoutType): string {
  return WORKOUT_TYPE_NAMES[type] ?? type;
}

export async function getCustomWorkoutTypes(): Promise<WorkoutType[]> {
  return (await db.workoutTypes.toCollection().primaryKeys()).sort((a, b) => a.localeCompare(b, 'ru'));
}

export async function getWorkoutTypes(): Promise<WorkoutType[]> {
  return [...Object.keys(WORKOUT_TYPE_NAMES), ...(await getCustomWorkoutTypes())];
}

export async function addWorkoutType(name: string): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('Название типа не может быть пустым');
  }

  const key = cleanName.toLowerCase();
  const taken = (await getWorkoutTypes()).some(
    (type) => type.toLowerCase() === key || workoutTypeName(type).toLowerCase() === key,
  );
  if (taken) {
    throw new Error('Такой тип уже есть');
  }
  await db.workoutTypes.add({ name: cleanName });
}

export async function deleteWorkoutType(name: string): Promise<void> {
  if ((await db.workouts.filter((workout) => workout.type === name).count()) > 0) {
    throw new Error('Этот тип уже есть в тренировках, удалить нельзя');
  }
  await db.workoutTypes.delete(name);
}

export interface LastPerformance {
  date: string;
  sets: WorkoutSet[];
}

export interface BestResult {
  set: WorkoutSet;
  date: string;
}

export interface UsedExercise {
  exercise: Exercise;
  best?: BestResult;
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

// Сначала самые новые: по дате тренировки, а за один день — внесённая позже
export async function getFinishedWorkouts(): Promise<Workout[]> {
  const workouts = await db.workouts.where('status').equals('finished').toArray();
  return workouts.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

export async function deleteWorkout(workoutId: number): Promise<void> {
  await db.workouts.delete(workoutId);
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
    ...saved.filter((exercise) => !exercise.hidden).map((exercise) => ({
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

export async function getHiddenExercises(): Promise<Exercise[]> {
  return db.exercises.filter((exercise) => exercise.hidden === true).toArray();
}

export async function setExerciseHidden(exerciseId: number, hidden: boolean): Promise<void> {
  await db.exercises.update(exerciseId, { hidden });
}

// История привязана к упражнению, а не к названию, поэтому переименование её не теряет
export async function updateExercise(
  exercise: Exercise,
  name: string,
  muscleGroup?: string,
): Promise<void> {
  const cleanName = name.trim();
  const nameKey = cleanName.toLowerCase();
  if (!cleanName) {
    throw new Error('Название упражнения не может быть пустым');
  }

  const same = await db.exercises.where('nameKey').equals(nameKey).first();
  if (same && same.id !== exercise.id) {
    throw new Error('Такое упражнение уже есть');
  }

  await db.transaction('rw', db.exercises, async () => {
    await db.exercises.update(exercise.id, { name: cleanName, nameKey, muscleGroup });
    // Иначе старое название из каталога появится в списке снова
    const wasInCatalog = CATALOG.some((item) => item.name.toLowerCase() === exercise.nameKey);
    if (wasInCatalog && nameKey !== exercise.nameKey) {
      await db.exercises.add({ name: exercise.name, nameKey: exercise.nameKey, hidden: true });
    }
  });
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

// Пиковый подход: больше вес, при равном весе больше повторений. Разминочные считаются,
// только если других подходов нет.
export function bestSet(sets: WorkoutSet[]): WorkoutSet | undefined {
  const working = sets.filter((set) => !set.warmup);
  return (working.length > 0 ? working : sets).reduce<WorkoutSet | undefined>(
    (best, set) =>
      !best || set.weight > best.weight || (set.weight === best.weight && set.reps > best.reps)
        ? set
        : best,
    undefined,
  );
}

export function formatSet(set: WorkoutSet): string {
  const marks = [set.warmup ? 'разминка' : '', set.toFailure ? 'в отказ' : ''].filter(Boolean);
  return `${set.weight} × ${set.reps}${marks.length > 0 ? ` (${marks.join(', ')})` : ''}`;
}

// Все подходы упражнения по завершённым тренировкам, новые сверху
export async function getExerciseHistory(exerciseId: number): Promise<LastPerformance[]> {
  const workouts = await getFinishedWorkouts();
  return workouts.flatMap((workout) =>
    workout.exercises
      .filter((item) => item.exerciseId === exerciseId)
      .map((item) => ({ date: workout.date, sets: item.sets })),
  );
}

// Лучший подход за всё время и дата, когда он был сделан впервые
export function bestResult(history: LastPerformance[]): BestResult | undefined {
  const oldestFirst = [...history].reverse();
  const set = bestSet(oldestFirst.flatMap((entry) => entry.sets));
  const date = oldestFirst.find((entry) => set && entry.sets.includes(set))?.date;
  return set && date ? { set, date } : undefined;
}

// Упражнения из завершённых тренировок с лучшим результатом: по группам мышц, затем по алфавиту
export async function getUsedExercises(): Promise<UsedExercise[]> {
  const workouts = await getFinishedWorkouts();
  const ids = [...new Set(workouts.flatMap((workout) => workout.exerciseIds))];
  const exercises = await db.exercises.bulkGet(ids);

  const used = await Promise.all(
    exercises.flatMap((exercise) =>
      exercise
        ? [getExerciseHistory(exercise.id).then((history) => ({ exercise, best: bestResult(history) }))]
        : [],
    ),
  );
  return used.sort(
    (a, b) =>
      groupRank(a.exercise.muscleGroup) - groupRank(b.exercise.muscleGroup) ||
      a.exercise.name.localeCompare(b.exercise.name, 'ru'),
  );
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
  details: Partial<Pick<Workout, 'date' | 'type' | 'durationMin' | 'rating' | 'note'>>,
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
export function stepValue(text: string, delta: number, min: number, max = Infinity): string {
  const current = Number(text.replace(',', '.'));
  const base = Number.isFinite(current) ? current : 0;
  return String(Math.min(Math.max(base + delta, min), max));
}

export function parseSet(
  weightText: string,
  repsText: string,
  warmup: boolean,
  toFailure = false,
): WorkoutSet {
  const weight = Number(weightText.replace(',', '.'));
  const reps = Number(repsText);

  if (weightText.trim() === '' || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(weight * 2)) {
    throw new Error('Вес: число с шагом 0.5 кг');
  }
  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error('Повторения: целое число больше нуля');
  }

  return { weight, reps, warmup, ...(toFailure ? { toFailure } : {}) };
}

// Часы и минуты из двух полей переводятся в минуты. Оба поля пустые — длительность не указана.
export function parseDuration(hoursText: string, minutesText: string): number | undefined {
  if (hoursText === '' && minutesText === '') {
    return undefined;
  }
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const isValid = Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && minutes >= 0;
  if (!isValid || minutes > 59 || hours * 60 + minutes < 1) {
    throw new Error('Длительность: часы и минуты, минут не больше 59');
  }
  return hours * 60 + minutes;
}
