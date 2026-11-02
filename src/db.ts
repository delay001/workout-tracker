import Dexie, { type EntityTable, type Table } from 'dexie';
import { t } from './i18n';

// upper, lower, other или название своего типа
export type WorkoutType = string;
export type WorkoutStatus = 'active' | 'finished';

export interface Exercise {
  id: number;
  name: string;
  // Название в нижнем регистре: «Жим лёжа» и «жим лёжа» — одно упражнение
  nameKey: string;
  muscleGroup?: string;
  note?: string;
  // Скрытое упражнение не предлагается при выборе, но остаётся в истории
  hidden?: boolean;
}

export interface WorkoutSet {
  // Упражнения со своим весом записываются с весом 0
  weight: number;
  reps: number;
  warmup: boolean;
  toFailure?: boolean;
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

export async function findOrCreateExercise(name: string, muscleGroup?: string): Promise<Exercise> {
  const cleanName = name.trim();
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

  const id = await db.exercises.add({ name: cleanName, nameKey, muscleGroup });
  return { id, name: cleanName, nameKey, muscleGroup };
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
