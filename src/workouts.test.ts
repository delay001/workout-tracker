import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { db, findOrCreateExercise, saveWorkout, type Workout } from './db';
import {
  addExerciseToWorkout,
  addSet,
  bestSet,
  defaultSet,
  finishWorkout,
  getActiveWorkout,
  getLastPerformance,
  isExactMatch,
  parseDuration,
  parseSet,
  removeExercise,
  removeSet,
  replaceExercise,
  searchOptions,
  setMuscleGroup,
  startWorkout,
  stepValue,
  updateSet,
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

describe('прошлый раз', () => {
  async function finished(date: string, exerciseId: number, weight: number): Promise<void> {
    await saveWorkout({
      date,
      type: 'upper',
      status: 'finished',
      exercises: [{ exerciseId, sets: [{ ...SET, weight }] }],
    });
  }

  async function lastWeight(): Promise<number | undefined> {
    return (await getLastPerformance(1, await active()))?.sets[0].weight;
  }

  it('берёт самую позднюю тренировку с этим упражнением', async () => {
    await finished('2026-10-01', 1, 60);
    await finished('2026-10-20', 1, 70);
    await finished('2026-10-25', 2, 99);
    await startWorkout('2026-11-02', 'upper');

    const last = await getLastPerformance(1, await active());

    expect(last?.date).toBe('2026-10-20');
    expect(last?.sets[0].weight).toBe(70);
  });

  it('смотрит на дату тренировки, а не на порядок внесения', async () => {
    await finished('2026-10-20', 1, 70);
    await finished('2026-10-01', 1, 60);
    await startWorkout('2026-11-02', 'upper');

    expect(await lastWeight()).toBe(70);
  });

  it('для тренировки задним числом не берёт более поздние', async () => {
    await finished('2026-10-01', 1, 60);
    await finished('2026-10-20', 1, 70);
    await startWorkout('2026-10-10', 'upper');

    expect(await lastWeight()).toBe(60);
  });

  it('из двух тренировок за день берёт внесённую позже', async () => {
    await finished('2026-10-20', 1, 60);
    await finished('2026-10-20', 1, 70);
    await startWorkout('2026-11-02', 'upper');

    expect(await lastWeight()).toBe(70);
  });

  it('не считает прошлым разом текущую тренировку', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addSet(await active(), 1, SET);

    expect(await getLastPerformance(1, await active())).toBeUndefined();
  });

  it('если записей нет, возвращает пусто', async () => {
    await startWorkout('2026-11-02', 'upper');

    expect(await getLastPerformance(1, await active())).toBeUndefined();
  });
});

describe('пиковый подход', () => {
  const set = (weight: number, reps: number, warmup = false) => ({ weight, reps, warmup });

  it('в приоритете вес, а не повторения', () => {
    expect(bestSet([set(50, 20), set(52, 12)])).toEqual(set(52, 12));
  });

  it('при равном весе берёт больше повторений', () => {
    expect(bestSet([set(52, 8), set(52, 12), set(52, 10)])).toEqual(set(52, 12));
  });

  it('не считает разминочные, если есть рабочие', () => {
    expect(bestSet([set(60, 5, true), set(50, 8)])).toEqual(set(50, 8));
  });

  it('если подходы только разминочные, берёт из них', () => {
    expect(bestSet([set(40, 10, true), set(50, 5, true)])).toEqual(set(50, 5, true));
  });

  it('без подходов возвращает пусто', () => {
    expect(bestSet([])).toBeUndefined();
  });
});

describe('подстановка в форму', () => {
  const warmup = { weight: 40, reps: 10, warmup: true };
  const working = { weight: 66, reps: 8, warmup: false };
  const heavy = { weight: 79, reps: 6, warmup: false };

  it('в начатом упражнении повторяет предыдущий подход', () => {
    expect(defaultSet([working, heavy], [warmup])).toEqual(heavy);
  });

  it('первый подход берёт первый рабочий из прошлого раза', () => {
    expect(defaultSet([], [warmup, working, heavy])).toEqual(working);
  });

  it('если в прошлый раз были только разминочные, берёт разминочный', () => {
    expect(defaultSet([], [warmup])).toEqual(warmup);
  });

  it('у нового упражнения ничего не подставляет', () => {
    expect(defaultSet([])).toBeUndefined();
  });
});

describe('замена и удаление упражнения', () => {
  it('замена сохраняет подходы и обновляет поиск по упражнению', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addSet(await active(), 1, SET);

    await replaceExercise(await active(), 1, 2);

    expect((await active()).exercises).toEqual([{ exerciseId: 2, sets: [SET] }]);
    expect((await active()).exerciseIds).toEqual([2]);
  });

  it('если новое уже есть в тренировке, подходы дописываются к нему', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addExerciseToWorkout(await active(), 2);
    await addSet(await active(), 1, SET);
    await addSet(await active(), 2, { ...SET, weight: 73 });

    await replaceExercise(await active(), 1, 2);

    expect((await active()).exercises).toEqual([
      { exerciseId: 2, sets: [{ ...SET, weight: 73 }, SET] },
    ]);
  });

  it('замена на то же упражнение ничего не меняет', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addSet(await active(), 1, SET);

    await replaceExercise(await active(), 1, 1);

    expect((await active()).exercises).toEqual([{ exerciseId: 1, sets: [SET] }]);
  });

  it('удаление убирает упражнение вместе с подходами', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addExerciseToWorkout(await active(), 2);
    await addSet(await active(), 1, SET);

    await removeExercise(await active(), 1);

    expect((await active()).exercises).toEqual([{ exerciseId: 2, sets: [] }]);
    expect((await active()).exerciseIds).toEqual([2]);
  });
});

describe('правка подхода', () => {
  it('меняет только выбранный подход', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addSet(await active(), 1, SET);
    await addSet(await active(), 1, { ...SET, weight: 73 });

    await updateSet(await active(), 1, 0, { weight: 70, reps: 10, warmup: false, toFailure: true });

    expect((await active()).exercises[0].sets).toEqual([
      { weight: 70, reps: 10, warmup: false, toFailure: true },
      { ...SET, weight: 73 },
    ]);
  });
});

describe('плюсы и минусы', () => {
  it('меняет вес на 0.5 кг и понимает запятую', () => {
    expect(stepValue('66', 0.5, 0)).toBe('66.5');
    expect(stepValue('79,5', -0.5, 0)).toBe('79');
  });

  it('не выходит за минимум и максимум', () => {
    expect(stepValue('0', -0.5, 0)).toBe('0');
    expect(stepValue('1', -1, 1)).toBe('1');
    expect(stepValue('55', 5, 0, 59)).toBe('59');
  });

  it('работает с пустым полем', () => {
    expect(stepValue('', 0.5, 0)).toBe('0.5');
    expect(stepValue('', 1, 1)).toBe('1');
  });
});

describe('завершение', () => {
  it('сохраняет длительность и заметку, упражнения без подходов убирает', async () => {
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addExerciseToWorkout(await active(), 2);
    await addSet(await active(), 1, SET);
    const { id } = await active();

    expect(await finishWorkout(await active(), { durationMin: 60, rating: 8, note: 'Тяжело' })).toBe(true);

    expect(await getActiveWorkout()).toBeUndefined();
    expect(await db.workouts.get(id)).toMatchObject({
      status: 'finished',
      durationMin: 60,
      rating: 8,
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
  async function names(query: string): Promise<string[]> {
    return (await searchOptions(query)).map((option) => option.name);
  }

  it('без запроса показывает весь каталог, сгруппированный по мышцам', async () => {
    const options = await searchOptions('');

    expect(options).toHaveLength(CATALOG.length);
    expect(options[0].muscleGroup).toBe('Грудь');
    expect(options.at(-1)?.muscleGroup).toBe('Ноги');
  });

  it('находит по части названия без учёта регистра', async () => {
    expect(await names('МОЛОТ')).toEqual(['Молотки']);
  });

  it('находит по старому названию из записей', async () => {
    expect(await names('жим платформы')).toEqual(['Жим ногами в тренажёре']);
    expect(await names('брусья')).toEqual(['Отжимания на брусьях']);
  });

  it('не различает е и ё', async () => {
    expect(await names('бабочка в тренажере')).toEqual(['Бабочка']);
  });

  it('своё упражнение показывается, а без группы идёт в конце', async () => {
    await findOrCreateExercise('Армрестлинг');

    expect((await names('')).at(-1)).toBe('Армрестлинг');
  });

  it('использованное упражнение не дублируется и хранит свою группу', async () => {
    await findOrCreateExercise('Молотки', 'Предплечья');

    const options = (await searchOptions('молотки'));

    expect(options).toHaveLength(1);
    expect(options[0].muscleGroup).toBe('Предплечья');
  });

  it('использованное упражнение находится и по старому названию', async () => {
    await findOrCreateExercise('Жим ногами в тренажёре', 'Ноги');

    expect(await names('жим платформы')).toEqual(['Жим ногами в тренажёре']);
  });

  it('точное совпадение учитывает другие названия', async () => {
    const options = await searchOptions('жим лежа');

    expect(isExactMatch(options, 'жим лежа')).toBe(true);
    expect(isExactMatch(options, 'жим')).toBe(false);
  });

  it('группу мышц можно поменять', async () => {
    const exercise = await findOrCreateExercise('Молотки', 'Бицепс');

    await setMuscleGroup(exercise.id, 'Предплечья');

    expect((await db.exercises.get(exercise.id))?.muscleGroup).toBe('Предплечья');
  });
});

describe('проверка ввода', () => {
  it('принимает вес с запятой, шагом 0.5 и вес 0', () => {
    expect(parseSet('79,5', '6', false)).toEqual({ weight: 79.5, reps: 6, warmup: false });
    expect(parseSet('0', '12', true)).toEqual({ weight: 0, reps: 12, warmup: true });
  });

  it('запоминает отметку «в отказ»', () => {
    expect(parseSet('66', '8', false, true)).toEqual({ weight: 66, reps: 8, warmup: false, toFailure: true });
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

  it('длительность необязательна и переводится в минуты', () => {
    expect(parseDuration('', '')).toBeUndefined();
    expect(parseDuration('1', '20')).toBe(80);
    expect(parseDuration('', '55')).toBe(55);
    expect(parseDuration('2', '')).toBe(120);
  });

  it.each([
    ['0', '0'],
    ['1', '60'],
    ['а', '5'],
  ])('отклоняет длительность %s ч %s мин', (hours, minutes) => {
    expect(() => parseDuration(hours, minutes)).toThrow();
  });
});
