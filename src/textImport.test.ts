import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getNameKeys, importParsedWorkouts, parseSets, parseWorkoutsText } from './textImport';

const TODAY = '2026-11-03';

const compact = (text: string): string[] =>
  parseSets(text).map((set) => `${set.weight}x${set.reps}`);

beforeEach(async () => {
  await db.exercises.clear();
  await db.workouts.clear();
});

describe('разбор подходов', () => {
  it.each([
    ['66x8, 73x8, 79x6', ['66x8', '73x8', '79x6']],
    ['80кг 5 на 3', ['80x5', '80x5', '80x5']],
    ['30кг 8на3', ['30x8', '30x8', '30x8']],
    ['8 на 2', ['0x8', '0x8']],
    ['100кг на 4,3,3', ['100x4', '100x3', '100x3']],
    ['66кг на 8, 73 кг на 8', ['66x8', '73x8']],
    ['100 на 3, 105 3 на 2', ['100x3', '105x3', '105x3']],
    ['(81кг) 8 на 2', ['81x8', '81x8']],
    ['14 кг 12 на 1, 16кг на 12 на 2', ['14x12', '16x12', '16x12']],
    ['20кг 8 на 1 (одна рука) 22кг 8 на 1', ['20x8', '22x8']],
    ['46кг на каждую руку 6 на 1', ['46x6']],
  ])('«%s»', (text, expected) => {
    expect(compact(text)).toEqual(expected);
  });

  it('без подходов возвращает пусто', () => {
    expect(compact('30кг на максимально')).toEqual([]);
  });
});

describe('разбор текста', () => {
  const parse = async (text: string) => parseWorkoutsText(text, await getNameKeys(), TODAY);

  it('разбирает тренировку с временем, заметками и кардио', async () => {
    const { workouts, skipped } = await parse(`
[02.11.2026 22:15] Коля: Верх 13.10.26 (мало сил)
1) элипс 7 минут
2) Жим лежа 100кг 3 на 2
3) подтягивания 5 на 1
Заметки: хорошо пошло
Время 1:20
`);

    expect(skipped).toEqual([]);
    expect(workouts).toEqual([
      {
        date: '2026-10-13',
        type: 'upper',
        durationMin: 80,
        note: 'хорошо пошло',
        entries: [
          { name: 'Элипс', sets: [{ weight: 0, reps: 0, warmup: false, minutes: 7 }] },
          { name: 'Жим лежа', sets: Array(2).fill({ weight: 100, reps: 3, warmup: false }) },
          { name: 'Подтягивания', sets: [{ weight: 0, reps: 5, warmup: false }] },
        ],
      },
    ]);
  });

  it('определяет тип по названию дня', async () => {
    const { workouts } = await parse('Ноги 15.07\nМолотки 20кг 8 на 1\nСпина 16.07\nМолотки 20кг 8 на 1');

    expect(workouts.map((workout) => workout.type)).toEqual(['lower', 'upper']);
  });

  it('без года берет последнюю прошедшую дату', async () => {
    const { workouts } = await parse('Верх 01.03\nМолотки 20кг 8 на 1\nВерх 20.12\nМолотки 20кг 8 на 1');

    expect(workouts.map((workout) => workout.date)).toEqual(['2026-03-01', '2025-12-20']);
  });

  it('незнакомые строки попадают в список пропущенных', async () => {
    const { skipped } = await parse('Верх 01.03\nНепонятное упражнение 20кг 8 на 3\nМолотки на макс');

    expect(skipped).toEqual(['Непонятное упражнение 20кг 8 на 3', 'Молотки на макс']);
  });

  it('строка с датой вроде «скакалка 30 мин 12.08» не становится заметкой', async () => {
    const { workouts, skipped } = await parse('Верх 01.03\nМолотки 20кг 8 на 1\nскакалка 30 мин 12.08.');

    expect(workouts[0].note).toBeUndefined();
    expect(skipped).toEqual(['скакалка 30 мин 12.08.']);
  });
});

describe('добавление в историю', () => {
  const text = 'Верх 01.03\nМолотки 20кг 8 на 1\nМолотки 22кг 8 на 1\nЖим лежа 100кг 3 на 1';

  it('создает завершенную тренировку и объединяет повторы упражнения', async () => {
    const { workouts } = parseWorkoutsText(text, await getNameKeys(), TODAY);

    expect(await importParsedWorkouts(workouts)).toBe(1);

    const [saved] = await db.workouts.toArray();
    const hammers = await db.exercises.where('nameKey').equals('молотки').first();
    expect(saved).toMatchObject({ date: '2026-03-01', type: 'upper', status: 'finished' });
    expect(saved.exercises).toHaveLength(2);
    expect(saved.exercises[0].sets).toHaveLength(2);
    expect(hammers?.muscleGroup).toBe('Бицепс');
  });

  it('повторный импорт не создает дублей', async () => {
    const { workouts } = parseWorkoutsText(text, await getNameKeys(), TODAY);

    await importParsedWorkouts(workouts);

    expect(await importParsedWorkouts(workouts)).toBe(0);
    expect(await db.workouts.count()).toBe(1);
  });
});
