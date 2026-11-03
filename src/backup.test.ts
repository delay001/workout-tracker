import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportData, importData, parseBackup } from './backup';
import { db, findOrCreateExercise, saveWorkout } from './db';

beforeEach(async () => {
  await db.exercises.clear();
  await db.workouts.clear();
  await db.workoutTypes.clear();
  await db.settings.clear();
  await db.templates.clear();
  await db.bodyWeights.clear();
  await db.measurements.clear();
});

async function fillData(): Promise<void> {
  await db.measurements.add({ date: '2026-11-02', values: { waist: 82.5 } });
  await db.workoutTypes.add({ name: 'Руки' });
  await db.settings.add({ key: 'name', value: 'Артем' });
  await db.templates.add({ type: 'upper', exerciseNames: ['Жим лежа'] });
  await db.bodyWeights.add({ date: '2026-11-02', kg: 85.5 });
  const exercise = await findOrCreateExercise('Тяга верхнего блока', 'Спина');
  await saveWorkout({
    date: '2026-11-02',
    type: 'upper',
    status: 'finished',
    durationMin: 55,
    rating: 8,
    note: 'Хорошо пошло',
    exercises: [
      {
        exerciseId: exercise.id,
        sets: [
          { weight: 66, reps: 8, warmup: true },
          { weight: 79.5, reps: 6, warmup: false, toFailure: true, rir: 1 },
        ],
      },
    ],
  });
}

describe('экспорт и импорт', () => {
  it('экспорт → удаление → импорт возвращает все', async () => {
    await fillData();
    const before = await exportData();
    const file = JSON.stringify(before);

    await db.exercises.clear();
    await db.workouts.clear();
    await db.workoutTypes.clear();
    await db.settings.clear();
    await db.templates.clear();
    await db.bodyWeights.clear();
    await db.measurements.clear();
    await importData(parseBackup(file));

    expect(await db.measurements.toArray()).toEqual([{ date: '2026-11-02', values: { waist: 82.5 } }]);
    expect(await db.settings.toArray()).toEqual([{ key: 'name', value: 'Артем' }]);
    expect(await db.templates.toArray()).toEqual([{ type: 'upper', exerciseNames: ['Жим лежа'] }]);
    expect(await db.bodyWeights.toArray()).toEqual([{ date: '2026-11-02', kg: 85.5 }]);
    expect(await db.exercises.toArray()).toEqual(before.exercises);
    expect(await db.workouts.toArray()).toEqual(before.workouts);
    expect(await db.workoutTypes.toArray()).toEqual([{ name: 'Руки' }]);
  });

  it('копия первой версии восстанавливается и убирает свои типы', async () => {
    await fillData();

    await importData(parseBackup(JSON.stringify({ app: 'workout-tracker', version: 1, exercises: [], workouts: [] })));

    expect(await db.workouts.count()).toBe(0);
    expect(await db.workoutTypes.count()).toBe(0);
  });

  it('импорт заменяет текущие данные, а не дополняет их', async () => {
    await fillData();
    const backup = await exportData();

    await findOrCreateExercise('Лишнее упражнение');
    await saveWorkout({ date: '2026-11-03', type: 'other', status: 'active', exercises: [] });
    await importData(backup);

    expect(await db.exercises.count()).toBe(1);
    expect(await db.workouts.count()).toBe(1);
  });

  it('при ошибке импорта старые данные остаются', async () => {
    await fillData();
    const backup = await exportData();
    const broken = { ...backup, exercises: [...backup.exercises, { ...backup.exercises[0], id: 99 }] };

    await expect(importData(broken)).rejects.toThrow();

    expect(await db.exercises.count()).toBe(1);
    expect(await db.workouts.count()).toBe(1);
  });
});

describe('проверка файла', () => {
  it('отклоняет файл, который не является JSON', () => {
    expect(() => parseBackup('это не json')).toThrow('не JSON');
  });

  it('отклоняет чужой JSON', () => {
    expect(() => parseBackup('{"name":"что-то другое"}')).toThrow('не резервная копия');
  });

  it('отклоняет копию от более новой версии', () => {
    const file = JSON.stringify({ app: 'workout-tracker', version: 999, exercises: [], workouts: [] });

    expect(() => parseBackup(file)).toThrow('более новой версией');
  });

  it('отклоняет подход без веса', () => {
    const file = JSON.stringify({
      app: 'workout-tracker',
      version: 1,
      exercises: [],
      workouts: [
        {
          id: 1,
          date: '2026-11-02',
          type: 'upper',
          status: 'finished',
          exerciseIds: [1],
          exercises: [{ exerciseId: 1, sets: [{ reps: 8, warmup: false }] }],
        },
      ],
    });

    expect(() => parseBackup(file)).toThrow('записаны неверно');
  });
});
