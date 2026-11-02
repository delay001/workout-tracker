import Dexie, { type EntityTable } from 'dexie';

export type WorkoutType = 'upper' | 'lower' | 'other';
export type WorkoutStatus = 'active' | 'finished';

export interface Exercise {
  id: number;
  name: string;
  // Название в нижнем регистре: «Жим лёжа» и «жим лёжа» — одно упражнение
  nameKey: string;
  muscleGroup?: string;
  note?: string;
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
  note?: string;
  exercises: WorkoutExercise[];
  // Повторяет exercises: нужно, чтобы быстро находить тренировки по упражнению
  exerciseIds: number[];
}

export type WorkoutDraft = Omit<Workout, 'id' | 'exerciseIds'> & { id?: number };

export const db = new Dexie('workout-tracker') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>;
  workouts: EntityTable<Workout, 'id'>;
};

db.version(1).stores({
  exercises: '++id, &nameKey',
  workouts: '++id, date, status, *exerciseIds',
});

export async function findOrCreateExercise(name: string, muscleGroup?: string): Promise<Exercise> {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new Error('Название упражнения не может быть пустым');
  }

  const nameKey = cleanName.toLowerCase();
  const existing = await db.exercises.where('nameKey').equals(nameKey).first();
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
