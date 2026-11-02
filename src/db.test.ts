import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, findOrCreateExercise, requestPersistentStorage, saveWorkout } from './db';

beforeEach(async () => {
  await db.exercises.clear();
  await db.workouts.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('упражнения', () => {
  it('создаёт новое упражнение с группой мышц', async () => {
    const exercise = await findOrCreateExercise('Жим лёжа', 'Грудь');

    expect(await db.exercises.get(exercise.id)).toMatchObject({
      name: 'Жим лёжа',
      muscleGroup: 'Грудь',
    });
  });

  it('не создаёт дубль, если отличаются только регистр и пробелы', async () => {
    const first = await findOrCreateExercise('Жим лёжа');
    const second = await findOrCreateExercise('  жим ЛЁЖА ');

    expect(second.id).toBe(first.id);
    expect(await db.exercises.count()).toBe(1);
  });

  it('не принимает пустое название', async () => {
    await expect(findOrCreateExercise('   ')).rejects.toThrow();
  });
});

describe('тренировки', () => {
  it('сохраняет тренировку с подходами целиком', async () => {
    const id = await saveWorkout({
      date: '2026-11-02',
      type: 'upper',
      status: 'finished',
      durationMin: 60,
      exercises: [
        {
          exerciseId: 1,
          sets: [
            { weight: 66, reps: 8, warmup: true },
            { weight: 79.5, reps: 6, warmup: false, rir: 1 },
          ],
        },
      ],
    });

    expect(await db.workouts.get(id)).toMatchObject({
      date: '2026-11-02',
      type: 'upper',
      durationMin: 60,
      exercises: [
        {
          sets: [
            { weight: 66, reps: 8, warmup: true },
            { weight: 79.5, reps: 6, warmup: false, rir: 1 },
          ],
        },
      ],
    });
  });

  it('находит тренировки по упражнению, без повторов', async () => {
    const id = await saveWorkout({
      date: '2026-11-02',
      type: 'lower',
      status: 'finished',
      exercises: [
        { exerciseId: 1, sets: [] },
        { exerciseId: 2, sets: [] },
        { exerciseId: 1, sets: [] },
      ],
    });
    await saveWorkout({
      date: '2026-11-03',
      type: 'upper',
      status: 'finished',
      exercises: [{ exerciseId: 3, sets: [] }],
    });

    const found = await db.workouts.where('exerciseIds').equals(1).toArray();

    expect(found.map((workout) => workout.id)).toEqual([id]);
    expect(found[0].exerciseIds).toEqual([1, 2]);
  });

  it('при повторном сохранении обновляет, а не создаёт новую', async () => {
    const base = { date: '2026-11-02', type: 'other', status: 'active', exercises: [] } as const;
    const id = await saveWorkout({ ...base, exercises: [] });

    await saveWorkout({ ...base, id, status: 'finished', exercises: [] });

    expect(await db.workouts.count()).toBe(1);
    expect((await db.workouts.get(id))?.status).toBe('finished');
  });
});

describe('постоянное хранение', () => {
  it('возвращает ответ браузера', async () => {
    vi.stubGlobal('navigator', { storage: { persist: async () => true } });

    expect(await requestPersistentStorage()).toBe(true);
  });

  it('не падает, если браузер этого не умеет', async () => {
    vi.stubGlobal('navigator', {});

    expect(await requestPersistentStorage()).toBe(false);
  });
});
