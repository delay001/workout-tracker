import { CATALOG, CATALOG_EN, exerciseLabel, groupKey, groupRank } from './catalog';
import type { Muscle } from './muscles';
import {
  db,
  findOrCreateExercise,
  withoutYo,
  saveWorkout,
  type Exercise,
  type Workout,
  type WorkoutSet,
  type WorkoutType,
} from './db';
import { t } from './i18n';
import { fromWeight, getUnits, toWeight } from './units';

const WORKOUT_TYPE_NAMES: Record<WorkoutType, string> = {
  upper: t('type.upper'),
  lower: t('type.lower'),
  cardio: t('type.cardio'),
  other: t('type.other'),
};

export function workoutTypeName(type: WorkoutType): string {
  return WORKOUT_TYPE_NAMES[type] ?? type;
}

export async function getCustomWorkoutTypes(): Promise<WorkoutType[]> {
  return (await db.workoutTypes.toCollection().primaryKeys()).sort((a, b) => a.localeCompare(b, 'ru'));
}

export async function getWorkoutTypes(): Promise<WorkoutType[]> {
  return ['upper', 'lower', 'cardio', ...(await getCustomWorkoutTypes()), 'other'];
}

export async function addWorkoutType(name: string): Promise<void> {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error(t('type.emptyName'));
  }

  const key = cleanName.toLowerCase();
  const taken = (await getWorkoutTypes()).some(
    (type) => type.toLowerCase() === key || workoutTypeName(type).toLowerCase() === key,
  );
  if (taken) {
    throw new Error(t('type.exists'));
  }
  await db.workoutTypes.add({ name: cleanName });
}

export async function deleteWorkoutType(name: string): Promise<void> {
  if ((await db.workouts.filter((workout) => workout.type === name).count()) > 0) {
    throw new Error(t('type.inUse'));
  }
  await db.workoutTypes.delete(name);
}

const MAX_WEIGHT_KG = 700;
const MAX_REPS = 200;
const MAX_MINUTES = 600;

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
  // Сколько раз упражнение выполнялось
  times: number;
}

export interface ExerciseOption {
  name: string;
  muscleGroup?: string;
  primaryMuscle?: Muscle;
  icon?: string;
  // Название и другие его варианты в виде для поиска
  keys: string[];
}

export async function getActiveWorkout(): Promise<Workout | undefined> {
  return db.workouts.where('status').equals('active').first();
}

// Сначала самые новые: по дате тренировки, а за один день — внесенная позже
export async function getFinishedWorkouts(): Promise<Workout[]> {
  const workouts = await db.workouts.where('status').equals('finished').toArray();
  return workouts.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}

export async function deleteWorkout(workoutId: number): Promise<void> {
  await db.workouts.delete(workoutId);
}

export async function startWorkout(date: string, type: WorkoutType): Promise<void> {
  if (await getActiveWorkout()) {
    return;
  }
  await saveWorkout({ date, type, status: 'active', exercises: [] });
}

// «Жим лежа» и «жим лежа» при поиске считаются одним и тем же
export function normalize(text: string): string {
  return withoutYo(text.trim().toLowerCase());
}

// По группе мышц, внутри группы по названию на языке интерфейса
function byGroupAndName(
  a: { name: string; muscleGroup?: string; primaryMuscle?: Muscle },
  b: { name: string; muscleGroup?: string; primaryMuscle?: Muscle },
): number {
  return groupRank(groupKey(a)) - groupRank(groupKey(b)) || exerciseLabel(a.name).localeCompare(exerciseLabel(b.name));
}

// Упражнения пользователя плюс каталог, без повторов. Каталог в базу не пишется:
// упражнение попадает туда, только когда его выбрали.
export async function getTemplate(type: WorkoutType): Promise<string[]> {
  return (await db.templates.get(type))?.exerciseNames ?? [];
}

export async function saveTemplate(type: WorkoutType, exerciseNames: string[]): Promise<void> {
  await db.templates.put({ type, exerciseNames });
}

// Активная тренировка с упражнениями из шаблона. Без подходов они при завершении уберутся.
export async function startFromTemplate(date: string, type: WorkoutType): Promise<void> {
  await startWorkout(date, type);
  for (const name of await getTemplate(type)) {
    const group = CATALOG.find((item) => item.name === name)?.group;
    const exercise = await findOrCreateExercise(name, group);
    const workout = await getActiveWorkout();
    if (workout) {
      await addExerciseToWorkout(workout, exercise.id);
    }
  }
}

export async function searchOptions(query: string): Promise<ExerciseOption[]> {
  const key = normalize(query);
  const saved = await db.exercises.toArray();
  const savedKeys = new Set(saved.map((exercise) => normalize(exercise.name)));
  // Упражнение каталога находится и по английскому названию
  const aliases = new Map(
    CATALOG.map((item) => [normalize(item.name), [...(item.aliases ?? []), CATALOG_EN[item.name] ?? item.name]]),
  );

  const options: ExerciseOption[] = [
    ...saved.filter((exercise) => !exercise.hidden).map((exercise) => ({
      name: exercise.name,
      muscleGroup: exercise.muscleGroup,
      primaryMuscle: exercise.primaryMuscle,
      icon: exercise.icon,
      keys: [exercise.name, ...(aliases.get(normalize(exercise.name)) ?? [])].map(normalize),
    })),
    ...CATALOG.filter((item) => !savedKeys.has(normalize(item.name))).map((item) => ({
      name: item.name,
      muscleGroup: item.group,
      keys: [item.name, ...(aliases.get(normalize(item.name)) ?? [])].map(normalize),
    })),
  ];

  return options
    .filter((option) => option.keys.some((optionKey) => optionKey.includes(key)))
    .sort(byGroupAndName);
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

// История привязана к упражнению, а не к названию, поэтому переименование ее не теряет
export async function updateExercise(
  exercise: Exercise,
  name: string,
  muscleGroup?: string,
): Promise<void> {
  const cleanName = withoutYo(name.trim());
  const nameKey = cleanName.toLowerCase();
  if (!cleanName) {
    throw new Error(t('exercise.emptyName'));
  }

  const same = await db.exercises.where('nameKey').equals(nameKey).first();
  if (same && same.id !== exercise.id) {
    throw new Error(t('exercise.exists'));
  }

  await db.transaction('rw', db.exercises, db.templates, async () => {
    await db.exercises.update(exercise.id, { name: cleanName, nameKey, muscleGroup });
    // Шаблоны хранят названия, поэтому переименование переносится и в них
    if (cleanName !== exercise.name) {
      for (const template of await db.templates.toArray()) {
        if (template.exerciseNames.includes(exercise.name)) {
          const exerciseNames = template.exerciseNames.map((item) => (item === exercise.name ? cleanName : item));
          await db.templates.put({ ...template, exerciseNames });
        }
      }
    }
    // Иначе старое название из каталога появится в списке снова
    const wasInCatalog = CATALOG.some((item) => item.name.toLowerCase() === exercise.nameKey);
    if (wasInCatalog && nameKey !== exercise.nameKey) {
      await db.exercises.add({ name: exercise.name, nameKey: exercise.nameKey, hidden: true });
    }
  });
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

// Последняя завершенная тренировка с этим упражнением, не позже даты текущей.
// Так тренировка, внесенная задним числом, сравнивается с тем, что было до нее.
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

// Расчетный 1ПМ по формуле Эпли. Считается только по подходам до 12 повторений с весом.
export function oneRepMax(set: WorkoutSet): number | undefined {
  if (set.weight === 0 || set.reps > 12) {
    return undefined;
  }
  return set.reps === 1 ? set.weight : set.weight * (1 + set.reps / 30);
}

// Рабочие подходы упражнения из завершенных тренировок не позже этой
export async function getPriorSets(exerciseId: number, workout: Workout): Promise<WorkoutSet[]> {
  const candidates = await db.workouts.where('exerciseIds').equals(exerciseId).toArray();
  return candidates
    .filter((item) => item.status === 'finished' && item.id !== workout.id && item.date <= workout.date)
    .flatMap((item) => item.exercises)
    .filter((item) => item.exerciseId === exerciseId)
    .flatMap((item) => item.sets)
    .filter((set) => !set.warmup);
}

// Какие рекорды бьет подход по сравнению с уже сделанными
function recordKinds(set: WorkoutSet, seen: WorkoutSet[]): string[] {
  const sameOrMoreReps = seen.filter((old) => old.reps >= set.reps).map((old) => old.weight);
  const sameWeight = seen.filter((old) => old.weight === set.weight).map((old) => old.reps);
  const oldBest = seen.flatMap((old) => oneRepMax(old) ?? []);
  const current = oneRepMax(set);

  return [
    sameOrMoreReps.length > 0 && set.weight > Math.max(...sameOrMoreReps) ? t('record.weight') : '',
    current !== undefined && oldBest.length > 0 && current > Math.max(...oldBest) ? t('record.oneRepMax') : '',
    sameWeight.length > 0 && set.reps > Math.max(...sameWeight) ? t('record.reps') : '',
  ].filter(Boolean);
}

// Подпись рекорда для каждого подхода. Первый раз в упражнении рекордом не считается.
export function recordLabels(sets: WorkoutSet[], priorSets: WorkoutSet[]): string[] {
  if (priorSets.length === 0) {
    return sets.map(() => '');
  }

  const seen = [...priorSets];
  return sets.map((set) => {
    if (set.warmup) {
      return '';
    }
    const kinds = recordKinds(set, seen);
    seen.push(set);
    return kinds.length > 0 ? t('record.prefix', { kinds: kinds.join(', ') }) : '';
  });
}

export function formatSet(set: WorkoutSet): string {
  if (set.minutes !== undefined) {
    return t('unit.minutesValue', { value: set.minutes });
  }
  const marks = [set.warmup ? t('set.warmupMark') : '', set.toFailure ? t('set.failureMark') : ''].filter(Boolean);
  return `${toWeight(set.weight)} × ${set.reps}${marks.length > 0 ? ` (${marks.join(', ')})` : ''}`;
}

// Все подходы упражнения по завершенным тренировкам, новые сверху
export async function getExerciseHistory(exerciseId: number): Promise<LastPerformance[]> {
  return historyOf(exerciseId, await getFinishedWorkouts());
}

function historyOf(exerciseId: number, workouts: Workout[]): LastPerformance[] {
  return workouts.flatMap((workout) =>
    workout.exercises
      .filter((item) => item.exerciseId === exerciseId)
      .map((item) => ({ date: workout.date, sets: item.sets })),
  );
}

// Лучший подход за все время и дата, когда он был сделан впервые
export function bestResult(history: LastPerformance[]): BestResult | undefined {
  const oldestFirst = [...history].reverse();
  const set = bestSet(oldestFirst.flatMap((entry) => entry.sets));
  const date = oldestFirst.find((entry) => set && entry.sets.includes(set))?.date;
  return set && date ? { set, date } : undefined;
}

// Упражнения из завершенных тренировок с лучшим результатом: по группам мышц, затем по алфавиту
export async function getUsedExercises(): Promise<UsedExercise[]> {
  const workouts = await getFinishedWorkouts();
  const ids = [...new Set(workouts.flatMap((workout) => workout.exerciseIds))];
  const exercises = await db.exercises.bulkGet(ids);

  const used = exercises.flatMap((exercise) => {
    if (!exercise) return [];
    const history = historyOf(exercise.id, workouts);
    return [{ exercise, best: bestResult(history), times: history.length }];
  });
  return used.sort((a, b) => byGroupAndName(a.exercise, b.exercise));
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

// Упражнения без подходов не сохраняются. Тренировка без подходов удаляется, тогда вернется false.
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

export function isCardio(exercise: Exercise): boolean {
  return groupKey(exercise) === 'cardio';
}

export function parseCardioSet(minutesText: string): WorkoutSet {
  const minutes = Number(minutesText);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_MINUTES) {
    throw new Error(t('set.invalidMinutes', { max: MAX_MINUTES }));
  }
  return { weight: 0, reps: 0, warmup: false, minutes };
}

export function parseSet(
  weightText: string,
  repsText: string,
  warmup: boolean,
  toFailure = false,
): WorkoutSet {
  const entered = Number(weightText.replace(',', '.'));
  const weight = fromWeight(entered);
  const reps = Number(repsText);

  if (weightText.trim() === '' || !Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT_KG || (getUnits() === 'metric' && !Number.isInteger(weight * 2))) {
    throw new Error(t('set.invalidWeight'));
  }
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) {
    throw new Error(t('set.invalidReps'));
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
  if (!isValid || minutes > 59 || hours > 12 || hours * 60 + minutes < 1) {
    throw new Error(t('workout.invalidDuration'));
  }
  return hours * 60 + minutes;
}
