import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportData, importData, parseBackup } from './backup';
import { db, findOrCreateExercise, saveWorkout } from './db';

beforeEach(async () => {
  await db.exercises.clear();
  await db.workouts.clear();
});

async function fillData(): Promise<void> {
  const exercise = await findOrCreateExercise('Тяга верхнего блока', 'Спина');
  await saveWorkout({
    date: '2026-11-02',
    type: 'upper',
    status: 'finished',
    durationMin: 55,
    note: 'Хорошо пошло',
    exercises: [
      {
        exerciseId: exercise.id,
        sets: [
          { weight: 66, reps: 8, warmup: true },
          { weight: 79.5, reps: 6, warmup: false, rir: 1 },
        ],
      },
    ],
  });
}

describe('экспорт и импорт', () => {
  it('экспорт → удаление → импорт возвращает всё', async () => {
    await fillData();
    const before = await exportData();
    const file = JSON.stringify(before);

    await db.exercises.clear();
    await db.workouts.clear();
    await importData(parseBackup(file));

    expect(await db.exercises.toArray()).toEqual(before.exercises);
    expect(await db.workouts.toArray()).toEqual(before.workouts);
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
