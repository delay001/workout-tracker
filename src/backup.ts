import { db, type Exercise, type Workout } from './db';

const APP_NAME = 'workout-tracker';
const BACKUP_VERSION = 1;

export interface Backup {
  app: typeof APP_NAME;
  version: number;
  exportedAt: string;
  exercises: Exercise[];
  workouts: Workout[];
}

export async function exportData(): Promise<Backup> {
  return {
    app: APP_NAME,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exercises: await db.exercises.toArray(),
    workouts: await db.workouts.toArray(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isExercise(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.name === 'string' &&
    typeof value.nameKey === 'string'
  );
}

function isSet(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.weight === 'number' &&
    typeof value.reps === 'number' &&
    typeof value.warmup === 'boolean'
  );
}

function isWorkoutExercise(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.exerciseId === 'number' &&
    Array.isArray(value.sets) &&
    value.sets.every(isSet)
  );
}

function isWorkout(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.date === 'string' &&
    typeof value.type === 'string' &&
    typeof value.status === 'string' &&
    Array.isArray(value.exerciseIds) &&
    Array.isArray(value.exercises) &&
    value.exercises.every(isWorkoutExercise)
  );
}

export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён или это не JSON');
  }

  if (!isRecord(data) || data.app !== APP_NAME) {
    throw new Error('Это не резервная копия трекера тренировок');
  }
  if (typeof data.version !== 'number' || data.version > BACKUP_VERSION) {
    throw new Error('Копия сделана более новой версией приложения');
  }
  if (
    !Array.isArray(data.exercises) ||
    !Array.isArray(data.workouts) ||
    !data.exercises.every(isExercise) ||
    !data.workouts.every(isWorkout)
  ) {
    throw new Error('В файле не хватает данных или они записаны неверно');
  }

  return data as unknown as Backup;
}

// Полностью заменяет данные. Транзакция: при любой ошибке старые данные останутся на месте.
export async function importData(backup: Backup): Promise<void> {
  await db.transaction('rw', db.exercises, db.workouts, async () => {
    await db.exercises.clear();
    await db.workouts.clear();
    await db.exercises.bulkAdd(backup.exercises);
    await db.workouts.bulkAdd(backup.workouts);
  });
}
