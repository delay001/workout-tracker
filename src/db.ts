import Dexie, { type EntityTable, type Table } from 'dexie';
import { t } from './i18n';
import { markupFor, type Movement, type Muscle } from './muscles';

// upper, lower, other или название своего типа
export type WorkoutType = string;
export type WorkoutStatus = 'active' | 'finished';

export interface Exercise {
  id: number;
  name: string;
  // Название в нижнем регистре: «Жим лежа» и «жим лежа» — одно упражнение
  nameKey: string;
  muscleGroup?: string;
  note?: string;
  // Скрытое упражнение не предлагается при выборе, но остается в истории
  hidden?: boolean;
  primaryMuscle?: Muscle;
  // Картинка, выбранная вручную: название упражнения каталога или group:мышца
  icon?: string;
  secondaryMuscles?: Muscle[];
  movement?: Movement;
}

export interface WorkoutSet {
  // Упражнения со своим весом записываются с весом 0
  weight: number;
  reps: number;
  warmup: boolean;
  toFailure?: boolean;
  // Кардио: вместо веса и повторений записывается время, вес и повторения равны нулю
  minutes?: number;
  rir?: number;
}

export interface WorkoutExercise {
  exerciseId: number;
  sets: WorkoutSet[];
}

export interface Workout {
  id: number;
  // Дата тренировки в виде ГГГГ-ММ-ДД
  date: string;
  type: WorkoutType;
  status: WorkoutStatus;
  durationMin?: number;
  // Оценка тренировки от 1 до 10
  rating?: number;
  note?: string;
  exercises: WorkoutExercise[];
  // Повторяет exercises: нужно, чтобы быстро находить тренировки по упражнению
  exerciseIds: number[];
}

export interface Setting {
  key: string;
  value: string;
}

export interface WorkoutTemplate {
  type: WorkoutType;
  exerciseNames: string[];
}

export interface BodyWeight {
  date: string;
  kg: number;
}

export interface Measurement {
  date: string;
  // Сантиметры по названию замера, заполненные не обязательно все
  values: Record<string, number>;
}

export type WorkoutDraft = Omit<Workout, 'id' | 'exerciseIds'> & { id?: number };

export const db = new Dexie('workout-tracker') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>;
  workouts: EntityTable<Workout, 'id'>;
  workoutTypes: Table<{ name: string }, string>;
  settings: Table<Setting, string>;
  templates: Table<WorkoutTemplate, string>;
  bodyWeights: Table<BodyWeight, string>;
  measurements: Table<Measurement, string>;
};

db.version(1).stores({
  exercises: '++id, &nameKey',
  workouts: '++id, date, status, *exerciseIds',
});

db.version(2).stores({ workoutTypes: 'name' });
db.version(3).stores({ settings: 'key', templates: 'type', bodyWeights: 'date' });
db.version(4).stores({ measurements: 'date' });

// В русском «е» вместо «е» пишут почти всегда, поэтому названия хранятся без «е»
export function withoutYo(text: string): string {
  return text.replaceAll('\u0451', '\u0435').replaceAll('\u0401', '\u0415');
}

export async function findOrCreateExercise(name: string, muscleGroup?: string): Promise<Exercise> {
  const cleanName = withoutYo(name.trim());
  if (!cleanName) {
    throw new Error(t('exercise.emptyName'));
  }

  const nameKey = cleanName.toLowerCase();
  const existing = await db.exercises.where('nameKey').equals(nameKey).first();
  if (existing?.hidden) {
    await db.exercises.update(existing.id, { hidden: false });
    return { ...existing, hidden: false };
  }
  if (existing) {
    return existing;
  }

  const exercise = { name: cleanName, nameKey, muscleGroup, ...markupFor(cleanName) };
  const id = await db.exercises.add(exercise);
  return { ...exercise, id };
}

// Старые названия с «е» переписываются через «е». Если такое упражнение уже есть,
// история переносится на него, а дубль удаляется.
export async function replaceYo(): Promise<void> {
  const hasYo = (text: string): boolean => withoutYo(text) !== text;
  const old = await db.exercises.filter((exercise) => hasYo(exercise.name)).toArray();
  const templates = (await db.templates.toArray()).filter((template) => template.exerciseNames.some(hasYo));
  if (old.length === 0 && templates.length === 0) {
    return;
  }
  await db.transaction('rw', db.exercises, db.workouts, db.templates, async () => {
    for (const exercise of old) {
      const name = withoutYo(exercise.name);
      const nameKey = name.toLowerCase();
      const same = await db.exercises.where('nameKey').equals(nameKey).first();
      if (!same) {
        await db.exercises.update(exercise.id, { name, nameKey });
        continue;
      }
      await db.workouts
        .where('exerciseIds')
        .equals(exercise.id)
        .modify((workout) => {
          workout.exercises = workout.exercises.map((item) =>
            item.exerciseId === exercise.id ? { ...item, exerciseId: same.id } : item,
          );
          workout.exerciseIds = [...new Set(workout.exercises.map((item) => item.exerciseId))];
        });
      if (same.hidden && !exercise.hidden) {
        await db.exercises.update(same.id, { hidden: false });
      }
      await db.exercises.delete(exercise.id);
    }
    for (const template of templates) {
      await db.templates.put({ ...template, exerciseNames: template.exerciseNames.map(withoutYo) });
    }
  });
}

// Дополняет упражнения разметкой мышц из каталога. Структура базы не меняется, заполненное не трогается.
export async function markUpExercises(): Promise<void> {
  await replaceYo();
  const exercises = await db.exercises.filter((exercise) => !exercise.primaryMuscle).toArray();
  for (const exercise of exercises) {
    const markup = markupFor(exercise.name);
    if (markup.primaryMuscle) {
      await db.exercises.update(exercise.id, markup);
    }
  }
}

export async function saveWorkout(draft: WorkoutDraft): Promise<number> {
  const exerciseIds = [...new Set(draft.exercises.map((item) => item.exerciseId))];
  return db.workouts.put({ ...draft, exerciseIds });
}

// Просит браузер не стирать данные при нехватке места. Браузер может отказать.
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) {
    return false;
  }
  return navigator.storage.persist();
}
