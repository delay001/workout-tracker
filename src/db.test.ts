import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, findOrCreateExercise, replaceYo, requestPersistentStorage, saveWorkout } from './db';

beforeEach(async () => {
  await db.exercises.clear();
  await db.workouts.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('упражнения', () => {
  it('создает новое упражнение с группой мышц', async () => {
    const exercise = await findOrCreateExercise('Жим лежа', 'Грудь');

    expect(await db.exercises.get(exercise.id)).toMatchObject({
      name: 'Жим лежа',
      muscleGroup: 'Грудь',
    });
  });

  it('не создает дубль, если отличаются только регистр и пробелы', async () => {
    const first = await findOrCreateExercise('Жим лежа');
    const second = await findOrCreateExercise('  жим ЛЕЖА ');

    expect(second.id).toBe(first.id);
    expect(await db.exercises.count()).toBe(1);
  });

  it('убирает «ё» из нового названия', async () => {
    expect((await findOrCreateExercise('Жим лёжа')).name).toBe('Жим лежа');
  });

  it('переписывает старые названия с «ё» и сливает дубль с историей', async () => {
    const old = await db.exercises.add({ name: 'Жим лёжа', nameKey: 'жим лёжа' });
    const same = await db.exercises.add({ name: 'Жим лежа', nameKey: 'жим лежа', hidden: true });
    const alone = await db.exercises.add({ name: 'Бицепс в тренажёре', nameKey: 'бицепс в тренажёре' });
    const id = await saveWorkout({
      date: '2026-11-02',
      type: 'upper',
      status: 'finished',
      exercises: [{ exerciseId: old, sets: [{ weight: 100, reps: 5, warmup: false }] }],
    });

    await replaceYo();

    expect(await db.exercises.get(old)).toBeUndefined();
    expect(await db.exercises.get(same)).toMatchObject({ hidden: false });
    expect(await db.exercises.get(alone)).toMatchObject({ name: 'Бицепс в тренажере', nameKey: 'бицепс в тренажере' });
    expect(await db.workouts.get(id)).toMatchObject({ exerciseIds: [same], exercises: [{ exerciseId: same }] });
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

  it('при повторном сохранении обновляет, а не создает новую', async () => {
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
