import {
  db,
  type BodyWeight,
  type Exercise,
  type Setting,
  type Workout,
  type WorkoutTemplate,
  type WorkoutType,
} from './db';

const APP_NAME = 'workout-tracker';
const BACKUP_VERSION = 3;

export interface Backup {
  app: typeof APP_NAME;
  version: number;
  exportedAt: string;
  exercises: Exercise[];
  workouts: Workout[];
  workoutTypes: WorkoutType[];
  settings: Setting[];
  templates: WorkoutTemplate[];
  bodyWeights: BodyWeight[];
}

export async function exportData(): Promise<Backup> {
  return {
    app: APP_NAME,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    exercises: await db.exercises.toArray(),
    workouts: await db.workouts.toArray(),
    workoutTypes: await db.workoutTypes.toCollection().primaryKeys(),
    settings: await db.settings.toArray(),
    templates: await db.templates.toArray(),
    bodyWeights: await db.bodyWeights.toArray(),
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

  // В копиях старых версий этих разделов ещё не было
  const workoutTypes = data.workoutTypes ?? [];
  const settings = data.settings ?? [];
  const templates = data.templates ?? [];
  const bodyWeights = data.bodyWeights ?? [];
  if (
    !Array.isArray(workoutTypes) ||
    !workoutTypes.every((type) => typeof type === 'string') ||
    !Array.isArray(settings) ||
    !settings.every((item) => isRecord(item) && typeof item.key === 'string') ||
    !Array.isArray(templates) ||
    !templates.every(
      (item) => isRecord(item) && typeof item.type === 'string' && Array.isArray(item.exerciseNames),
    ) ||
    !Array.isArray(bodyWeights) ||
    !bodyWeights.every(
      (item) => isRecord(item) && typeof item.date === 'string' && typeof item.kg === 'number',
    )
  ) {
    throw new Error('В файле не хватает данных или они записаны неверно');
  }

  return { ...data, workoutTypes, settings, templates, bodyWeights } as unknown as Backup;
}

// Полностью заменяет данные. Транзакция: при любой ошибке старые данные останутся на месте.
export async function importData(backup: Backup): Promise<void> {
  const tables = [db.exercises, db.workouts, db.workoutTypes, db.settings, db.templates, db.bodyWeights];
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table.clear()));
    await db.exercises.bulkAdd(backup.exercises);
    await db.workouts.bulkAdd(backup.workouts);
    await db.workoutTypes.bulkAdd(backup.workoutTypes.map((name) => ({ name })));
    await db.settings.bulkAdd(backup.settings);
    await db.templates.bulkAdd(backup.templates);
    await db.bodyWeights.bulkAdd(backup.bodyWeights);
  });
}
