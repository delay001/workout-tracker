import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, findOrCreateExercise, type Workout } from './db';
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  getActiveWorkout,
  parseDuration,
  parseSet,
  removeSet,
  searchExercises,
  startWorkout,
} from './workouts';

const SET = { weight: 66, reps: 8, warmup: false };

async function active(): Promise<Workout> {
  const workout = await getActiveWorkout();
  if (!workout) {
    throw new Error('Нет активной тренировки');
  }
  return workout;
}

beforeEach(async () => {
  await db.exercises.clear();
  await db.workouts.clear();
});

describe('ход тренировки', () => {
  it('начатая тренировка находится с нужными датой и типом', async () => {
    await startWorkout('2026-10-30', 'lower');

    expect(await active()).toMatchObject({ date: '2026-10-30', type: 'lower', status: 'active' });
  });

  it('подход сохраняется сразу и только в своём упражнении', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addExerciseToWorkout(await active(), 2);

    await addSet(await active(), 2, SET);

    expect((await active()).exercises).toEqual([
      { exerciseId: 1, sets: [] },
      { exerciseId: 2, sets: [SET] },
    ]);
  });

  it('одно упражнение не добавляется дважды', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addExerciseToWorkout(await active(), 1);

    expect((await active()).exercises).toHaveLength(1);
  });

  it('удаляет именно выбранный подход', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addSet(await active(), 1, SET);
    await addSet(await active(), 1, { ...SET, weight: 73 });
    await addSet(await active(), 1, { ...SET, weight: 79 });

    await removeSet(await active(), 1, 1);

    expect((await active()).exercises[0].sets.map((set) => set.weight)).toEqual([66, 79]);
  });
});

describe('завершение', () => {
  it('сохраняет длительность и заметку, упражнения без подходов убирает', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addExerciseToWorkout(await active(), 2);
    await addSet(await active(), 1, SET);
    const { id } = await active();

    expect(await finishWorkout(await active(), { durationMin: 60, note: 'Тяжело' })).toBe(true);

    expect(await getActiveWorkout()).toBeUndefined();
    expect(await db.workouts.get(id)).toMatchObject({
      status: 'finished',
      durationMin: 60,
      note: 'Тяжело',
      exerciseIds: [1],
    });
  });

  it('тренировка без подходов не сохраняется', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);

    expect(await finishWorkout(await active(), {})).toBe(false);

    expect(await db.workouts.count()).toBe(0);
  });
});

describe('поиск упражнений', () => {
  it('ищет по части названия без учёта регистра, по алфавиту', async () => {
    await findOrCreateExercise('Тяга верхнего блока');
    await findOrCreateExercise('Становая тяга');
    await findOrCreateExercise('Жим лёжа');

    const found = await searchExercises('ТЯГА');

    expect(found.map((exercise) => exercise.name)).toEqual(['Становая тяга', 'Тяга верхнего блока']);
  });
});

describe('проверка ввода', () => {
  it('принимает вес с запятой, шагом 0.5 и вес 0', () => {
    expect(parseSet('79,5', '6', false)).toEqual({ weight: 79.5, reps: 6, warmup: false });
    expect(parseSet('0', '12', true)).toEqual({ weight: 0, reps: 12, warmup: true });
  });

  it.each([
    ['', '8'],
    ['66.3', '8'],
    ['-5', '8'],
    ['66', ''],
    ['66', '0'],
    ['66', '7.5'],
  ])('отклоняет вес «%s» и повторения «%s»', (weight, reps) => {
    expect(() => parseSet(weight, reps, false)).toThrow();
  });

  it('длительность необязательна, но должна быть целым числом', () => {
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('75')).toBe(75);
    expect(() => parseDuration('1.5')).toThrow();
  });
});
