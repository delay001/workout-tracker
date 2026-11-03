import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutSet } from './db';
import {
  daysBetween,
  exerciseSummary,
  filterByPeriod,
  historyRecords,
  oneRepMaxSeries,
  overdueExercises,
  periodTotals,
  tonnageSeries,
  topExercises,
  workingWeightSeries,
} from './progress';

const set = (weight: number, reps: number, warmup = false): WorkoutSet => ({ weight, reps, warmup });
const TODAY = '2026-11-04'; // среда

function workout(date: string, ids: number[], sets: WorkoutSet[] = [], durationMin?: number): Workout {
  return {
    id: 1,
    date,
    type: 'upper',
    status: 'finished',
    durationMin,
    exercises: ids.map((exerciseId) => ({ exerciseId, sets })),
    exerciseIds: ids,
  };
}

const history = [
  { date: '2026-11-01', sets: [set(90, 10), set(200, 1, true)] },
  { date: '2026-10-01', sets: [set(120, 1), set(100, 5)] },
];

describe('ряды для графиков', () => {
  it('1ПМ берёт лучший рабочий подход и идёт от старых дат к новым', () => {
    expect(oneRepMaxSeries(history)).toEqual([
      { date: '2026-10-01', value: 120 },
      { date: '2026-11-01', value: 120 },
    ]);
  });

  it('подходы без 1ПМ не дают точек', () => {
    expect(oneRepMaxSeries([{ date: '2026-10-01', sets: [set(50, 20)] }])).toEqual([]);
  });

  it('вес берётся по лучшему подходу без разминочных', () => {
    expect(workingWeightSeries(history).map((point) => point.value)).toEqual([120, 90]);
  });

  it('тоннаж двух тренировок за день складывается', () => {
    expect(
      tonnageSeries([
        { date: '2026-10-01', sets: [set(100, 5)] },
        { date: '2026-10-01', sets: [set(10, 10)] },
      ]),
    ).toEqual([{ date: '2026-10-01', value: 600 }]);
  });
});

describe('периоды', () => {
  const series = [
    { date: '2025-10-01', value: 1 },
    { date: '2026-09-01', value: 2 },
    { date: '2026-10-20', value: 3 },
  ];

  it.each([
    ['1m', [3]],
    ['3m', [2, 3]],
    ['1y', [2, 3]],
    ['all', [1, 2, 3]],
  ] as const)('%s', (period, expected) => {
    expect(filterByPeriod(series, period, TODAY).map((point) => point.value)).toEqual(expected);
  });
});

describe('показатели упражнения', () => {
  it('совпадают с ручным расчётом', () => {
    expect(exerciseSummary(history, TODAY)).toEqual({
      times: 2,
      lastDate: '2026-11-01',
      bestOneRepMax: 120,
      currentOneRepMax: 120,
      fromPeak: 100,
      maxTonnage: 900,
    });
  });

  it('«сила от пика» считает только последние 4 недели', () => {
    const summary = exerciseSummary(
      [
        { date: '2026-11-01', sets: [set(90, 1)] },
        { date: '2026-09-01', sets: [set(120, 1)] },
      ],
      TODAY,
    );

    expect(summary.currentOneRepMax).toBe(90);
    expect(summary.fromPeak).toBe(75);
  });

  it('без недавних записей текущего 1ПМ нет', () => {
    const summary = exerciseSummary([{ date: '2026-01-01', sets: [set(100, 1)] }], TODAY);

    expect(summary.currentOneRepMax).toBeUndefined();
    expect(summary.fromPeak).toBeUndefined();
  });

  it('пустая история не ломает расчёт', () => {
    expect(exerciseSummary([], TODAY)).toMatchObject({ times: 0, maxTonnage: 0 });
  });
});

describe('рекорды в истории', () => {
  it('сравнивает только с тем, что было раньше', () => {
    expect(
      historyRecords([
        { date: '2026-11-01', sets: [set(110, 3)] },
        { date: '2026-10-01', sets: [set(100, 3)] },
      ]),
    ).toEqual([['Рекорд: Вес, 1ПМ'], ['']]);
  });
});

describe('давно не делал', () => {
  it('показывает упражнения старше порога, сначала самые старые', () => {
    const workouts = [
      workout('2026-10-01', [1, 2]),
      workout('2026-09-01', [3]),
      workout('2026-11-01', [1]),
    ];

    expect(overdueExercises(workouts, 21, TODAY)).toEqual([
      { exerciseId: 3, days: 64 },
      { exerciseId: 2, days: 34 },
    ]);
  });

  it('считает дни между датами', () => {
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('общая статистика', () => {
  it('разделяет неделю с понедельника, месяц и год', () => {
    const workouts = [
      workout('2026-11-02', [1], [set(100, 5)], 60),
      workout('2026-11-01', [1], [set(100, 5)], 30),
      workout('2026-10-01', [1], [set(100, 5)]),
      workout('2025-12-31', [1], [set(100, 5)]),
    ];

    expect(periodTotals(workouts, TODAY)).toEqual({
      week: { workouts: 1, durationMin: 60, tonnage: 500 },
      month: { workouts: 2, durationMin: 90, tonnage: 1000 },
      year: { workouts: 3, durationMin: 90, tonnage: 1500 },
    });
  });

  it('топ упражнений идёт по частоте', () => {
    const workouts = [workout('2026-11-01', [1, 2]), workout('2026-11-02', [2]), workout('2026-11-03', [3])];

    expect(topExercises(workouts, 2)).toEqual([
      { exerciseId: 2, count: 2 },
      { exerciseId: 1, count: 1 },
    ]);
  });
});
