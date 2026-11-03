import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { db, findOrCreateExercise, saveWorkout, type Workout } from './db';
import {
  addExerciseToWorkout,
  addSet,
  addWorkoutType,
  bestResult,
  bestSet,
  deleteWorkout,
  deleteWorkoutType,
  finishWorkout,
  getActiveWorkout,
  getCustomWorkoutTypes,
  getExerciseHistory,
  getFinishedWorkouts,
  getHiddenExercises,
  getLastPerformance,
  getPriorSets,
  getUsedExercises,
  getWorkoutTypes,
  isExactMatch,
  parseDuration,
  oneRepMax,
  parseSet,
  recordLabels,
  removeExercise,
  removeSet,
  replaceExercise,
  saveTemplate,
  searchOptions,
  setExerciseHidden,
  startFromTemplate,
  startWorkout,
  stepValue,
  updateExercise,
  updateSet,
  workoutTypeName,
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

  it('вторую тренировку начать нельзя, пока есть активная', async () => {
    await startWorkout('2026-10-30', 'lower');
    await startWorkout('2026-11-02', 'upper');

    expect(await db.workouts.count()).toBe(1);
    expect(await active()).toMatchObject({ date: '2026-10-30', type: 'lower' });
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

describe('история', () => {
  const save = (date: string, status: 'active' | 'finished' = 'finished') =>
    saveWorkout({ type: 'upper', exercises: [{ exerciseId: 1, sets: [SET] }], date, status });

  it('показывает только завершённые, новые сверху', async () => {
    await save('2026-10-01');
    await save('2026-10-20');
    await save('2026-10-10');
    await save('2026-11-02', 'active');

    const dates = (await getFinishedWorkouts()).map((workout) => workout.date);

    expect(dates).toEqual(['2026-10-20', '2026-10-10', '2026-10-01']);
  });

  it('удаляет выбранную тренировку', async () => {
    const id = await save('2026-10-01');
    await save('2026-10-20');

    await deleteWorkout(id);

    expect((await getFinishedWorkouts()).map((workout) => workout.date)).toEqual(['2026-10-20']);
  });

  it('правка завершённой тренировки меняет дату, тип и оценку', async () => {
    const id = await save('2026-10-01');
    const workout = await db.workouts.get(id);

    await finishWorkout(workout!, { date: '2026-10-02', type: 'lower', rating: undefined, durationMin: 80 });

    expect(await db.workouts.get(id)).toMatchObject({
      date: '2026-10-02',
      type: 'lower',
      status: 'finished',
      durationMin: 80,
    });
  });

  it('прошлым разом для исправляемой тренировки не считается она сама', async () => {
    await save('2026-10-01');
    const id = await save('2026-10-20');

    const last = await getLastPerformance(1, (await db.workouts.get(id))!);

    expect(last?.date).toBe('2026-10-01');
  });
});

describe('история по упражнению', () => {
  const set = (weight: number, reps: number, warmup = false) => ({ weight, reps, warmup });

  async function finished(date: string, exerciseId: number, sets: ReturnType<typeof set>[]): Promise<void> {
    await saveWorkout({ date, type: 'upper', status: 'finished', exercises: [{ exerciseId, sets }] });
  }

  it('показывает только это упражнение и только завершённые, новые сверху', async () => {
    await finished('2026-10-01', 1, [set(60, 8)]);
    await finished('2026-10-20', 1, [set(70, 8)]);
    await finished('2026-10-10', 2, [set(99, 8)]);
    await startWorkout('2026-11-02', 'upper');
    await addExerciseToWorkout(await active(), 1);
    await addSet(await active(), 1, SET);

    const history = await getExerciseHistory(1);

    expect(history.map((entry) => entry.date)).toEqual(['2026-10-20', '2026-10-01']);
  });

  it('лучший результат: вес важнее повторений, разминочные не считаются', async () => {
    await finished('2026-10-01', 1, [set(50, 20), set(52, 12)]);
    await finished('2026-10-20', 1, [set(100, 3, true), set(51, 15)]);

    expect(bestResult(await getExerciseHistory(1))).toEqual({ set: set(52, 12), date: '2026-10-01' });
  });

  it('повторённый рекорд датируется первым разом', async () => {
    await finished('2026-10-01', 1, [set(52, 12)]);
    await finished('2026-10-20', 1, [set(52, 12)]);

    expect(bestResult(await getExerciseHistory(1))?.date).toBe('2026-10-01');
  });

  it('без записей лучшего результата нет', () => {
    expect(bestResult([])).toBeUndefined();
  });

  it('список использованных упражнений идёт по группам и с лучшим результатом', async () => {
    const legs = await findOrCreateExercise('Румынская тяга', 'Ноги');
    const chest = await findOrCreateExercise('Жим лёжа', 'Грудь');
    await findOrCreateExercise('Ни разу не выполнялось', 'Спина');
    await finished('2026-10-01', legs.id, [set(80, 8)]);
    await finished('2026-10-02', chest.id, [set(100, 3)]);

    const used = await getUsedExercises();

    expect(used.map((item) => [item.exercise.name, item.best?.set.weight])).toEqual([
      ['Жим лёжа', 100],
      ['Румынская тяга', 80],
    ]);
  });
});

describe('шаблоны', () => {
  beforeEach(async () => {
    await db.templates.clear();
  });

  it('тренировка из шаблона получает упражнения с группами, без подходов', async () => {
    await saveTemplate('lower', ['Разгибание ног сидя', 'Молотки']);
    await startFromTemplate('2026-11-02', 'lower');

    const workout = await active();
    const first = await db.exercises.get(workout.exercises[0].exerciseId);

    expect(workout.exercises).toHaveLength(2);
    expect(workout.exercises.every((item) => item.sets.length === 0)).toBe(true);
    expect(first).toMatchObject({ name: 'Разгибание ног сидя', muscleGroup: 'Ноги' });
  });

  it('по умолчанию шаблоны пустые', async () => {
    await startFromTemplate('2026-11-02', 'upper');

    expect((await active()).exercises).toEqual([]);
  });

  it('у типа без шаблона упражнений нет', async () => {
    await startFromTemplate('2026-11-02', 'Руки');

    expect((await active()).exercises).toEqual([]);
  });

});

describe('личные рекорды', () => {
  const set = (weight: number, reps: number, warmup = false) => ({ weight, reps, warmup });

  it('считает 1ПМ по формуле Эпли', () => {
    expect(oneRepMax(set(90, 10))).toBe(120);
  });

  it('для одного повторения 1ПМ равен весу', () => {
    expect(oneRepMax(set(100, 1))).toBe(100);
  });

  it('подходы больше 12 повторений и свой вес не дают 1ПМ', () => {
    expect(oneRepMax(set(50, 13))).toBeUndefined();
    expect(oneRepMax(set(0, 8))).toBeUndefined();
  });

  it('отмечает новый вес и новый 1ПМ', () => {
    expect(recordLabels([set(105, 3)], [set(100, 3)])).toEqual(['Рекорд: Вес, 1ПМ']);
  });

  it('больше повторений с тем же весом — рекорд по 1ПМ и повторениям', () => {
    expect(recordLabels([set(100, 5)], [set(100, 3)])).toEqual(['Рекорд: 1ПМ, Повторы']);
  });

  it('больший вес при меньшем числе повторений, чем у прежнего, сравнивается с ним', () => {
    expect(recordLabels([set(90, 8)], [set(100, 8), set(80, 8)])).toEqual(['']);
  });

  it('в упражнении со своим весом рекорд по повторениям', () => {
    expect(recordLabels([set(0, 6)], [set(0, 5)])).toEqual(['Рекорд: Повторы']);
  });

  it('больший вес с малым числом повторений — рекорд только по весу', () => {
    expect(recordLabels([set(105, 1)], [set(100, 10)])).toEqual(['Рекорд: Вес']);
  });

  it('повторённый результат не рекорд, разминочные и свой вес не считаются', () => {
    expect(recordLabels([set(100, 3), set(200, 1, true), set(0, 20)], [set(100, 3)])).toEqual(['', '', '']);
  });

  it('второй подход сравнивается и с первым подходом этой тренировки', () => {
    expect(recordLabels([set(105, 3), set(105, 3)], [set(100, 3)])).toEqual(['Рекорд: Вес, 1ПМ', '']);
  });

  it('первый раз в упражнении рекордом не считается', () => {
    expect(recordLabels([set(50, 8)], [])).toEqual(['']);
  });

  it('прошлые подходы берутся из завершённых тренировок без разминочных', async () => {
    await saveWorkout({
      date: '2026-10-01',
      type: 'upper',
      status: 'finished',
      exercises: [{ exerciseId: 1, sets: [set(40, 10, true), set(60, 8)] }],
    });
    await saveWorkout({
      date: '2026-11-20',
      type: 'upper',
      status: 'finished',
      exercises: [{ exerciseId: 1, sets: [set(99, 8)] }],
    });
    await startWorkout('2026-11-02', 'upper');

    expect(await getPriorSets(1, await active())).toEqual([set(60, 8)]);
  });
});

describe('типы тренировок', () => {
  beforeEach(async () => {
    await db.workoutTypes.clear();
  });

  it('свой тип добавляется после встроенных и показывается своим названием', async () => {
    await addWorkoutType('  Руки ');

    expect(await getWorkoutTypes()).toEqual(['upper', 'lower', 'Руки', 'other']);
    expect(workoutTypeName('Руки')).toBe('Руки');
    expect(workoutTypeName('upper')).toBe('Верх');
  });

  it.each(['верх', 'upper', 'РУКИ', '  '])('не принимает «%s»', async (name) => {
    await addWorkoutType('Руки');

    await expect(addWorkoutType(name)).rejects.toThrow();
    expect(await getCustomWorkoutTypes()).toEqual(['Руки']);
  });

  it('удаляет неиспользованный тип', async () => {
    await addWorkoutType('Руки');

    await deleteWorkoutType('Руки');

    expect(await getCustomWorkoutTypes()).toEqual([]);
  });

  it('не удаляет тип, который есть в тренировке', async () => {
    await addWorkoutType('Руки');
    await startWorkout('2026-11-02', 'Руки');

    await expect(deleteWorkoutType('Руки')).rejects.toThrow('удалить нельзя');
    expect(await getCustomWorkoutTypes()).toEqual(['Руки']);
  });
});

describe('управление упражнениями', () => {
  it('скрытое упражнение не предлагается, но не теряется', async () => {
    const exercise = await findOrCreateExercise('Молотки', 'Бицепс');

    await setExerciseHidden(exercise.id, true);

    expect(await searchOptions('молотки')).toEqual([]);
    expect((await getHiddenExercises()).map((item) => item.name)).toEqual(['Молотки']);
  });

  it('скрытое можно вернуть, в том числе выбрав его заново', async () => {
    const exercise = await findOrCreateExercise('Молотки', 'Бицепс');
    await setExerciseHidden(exercise.id, true);

    await findOrCreateExercise('Молотки');

    expect(await searchOptions('молотки')).toHaveLength(1);
    expect(await getHiddenExercises()).toEqual([]);
  });

  it('переименование сохраняет упражнение, и старое название из каталога не возвращается', async () => {
    const exercise = await findOrCreateExercise('Молотки', 'Бицепс');

    await updateExercise(exercise, 'Хаммер сгибания', 'Предплечья');

    expect(await db.exercises.get(exercise.id)).toMatchObject({
      name: 'Хаммер сгибания',
      muscleGroup: 'Предплечья',
    });
    expect((await searchOptions('молотки')).map((option) => option.name)).toEqual([]);
  });

  it('переименование меняет название и в шаблонах', async () => {
    const exercise = await findOrCreateExercise('Молотки', 'Бицепс');
    await saveTemplate('upper', ['Жим лёжа', 'Молотки']);

    await updateExercise(exercise, 'Хаммер сгибания', 'Бицепс');

    expect((await db.templates.get('upper'))?.exerciseNames).toEqual(['Жим лёжа', 'Хаммер сгибания']);
  });

  it('смена только группы не создаёт лишних записей', async () => {
    const exercise = await findOrCreateExercise('Молотки', 'Бицепс');

    await updateExercise(exercise, 'Молотки', 'Предплечья');

    expect(await db.exercises.count()).toBe(1);
  });

  it('нельзя переименовать в уже существующее или пустое название', async () => {
    await findOrCreateExercise('Молотки');
    const other = await findOrCreateExercise('Жим лёжа');

    await expect(updateExercise(other, 'молотки')).rejects.toThrow('уже есть');
    await expect(updateExercise(other, '  ')).rejects.toThrow('пустым');
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
    expect(options.at(-1)?.muscleGroup).toBe('Кардио');
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
    expect(isExactMatch(options, 'жим ле')).toBe(false);
  });

  it('группу мышц можно поменять', async () => {
    const exercise = await findOrCreateExercise('Молотки', 'Бицепс');

    await updateExercise(exercise, 'Молотки', 'Предплечья');

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
