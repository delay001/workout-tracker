import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutSet } from './db';
import { goalPercent, monthlyTonnage, monthStats, tonnage, workoutCounts } from './stats';

const set = (weight: number, reps: number, warmup = false): WorkoutSet => ({ weight, reps, warmup });

function workout(date: string, type: string, sets: WorkoutSet[], durationMin?: number): Workout {
  return {
    id: 1,
    date,
    type,
    status: 'finished',
    durationMin,
    exercises: [{ exerciseId: 1, sets }],
    exerciseIds: [1],
  };
}

describe('тренировки по неделям и месяцам', () => {
  const workouts = ['2026-10-01', '2026-10-04', '2026-10-05', '2026-10-31', '2026-11-02'].map((date) =>
    workout(date, 'upper', [set(50, 5)]),
  );

  it('недели начинаются с понедельника и обрезаются по периоду', () => {
    expect(workoutCounts(workouts, '2026-10-01', '2026-10-31', 'week')).toEqual([
      { start: '2026-10-01', end: '2026-10-04', count: 2 },
      { start: '2026-10-05', end: '2026-10-11', count: 1 },
      { start: '2026-10-12', end: '2026-10-18', count: 0 },
      { start: '2026-10-19', end: '2026-10-25', count: 0 },
      { start: '2026-10-26', end: '2026-10-31', count: 1 },
    ]);
  });

  it('месяцы идут через границу года', () => {
    expect(workoutCounts(workouts, '2026-10-01', '2027-01-31', 'month').map((item) => [item.start, item.end, item.count])).toEqual([
      ['2026-10-01', '2026-10-31', 4],
      ['2026-11-01', '2026-11-30', 1],
      ['2026-12-01', '2026-12-31', 0],
      ['2027-01-01', '2027-01-31', 0],
    ]);
  });
});

describe('тоннаж', () => {
  it('считает рабочие подходы, разминочные и свой вес не добавляют', () => {
    expect(tonnage([set(100, 5), set(50, 10), set(200, 5, true), set(0, 20)])).toBe(1000);
  });
});

describe('статистика месяца', () => {
  const workouts = [
    workout('2026-10-01', 'upper', [set(100, 5)], 60),
    workout('2026-10-20', 'upper', [set(50, 10), set(40, 10, true)], 30),
    workout('2026-10-25', 'lower', [set(100, 10)]),
    workout('2026-11-01', 'upper', [set(100, 5)]),
  ];

  it('считает только выбранный месяц', () => {
    expect(monthStats(workouts, 2026, 9)).toEqual({
      count: 3,
      sets: 3,
      tonnage: 2000,
      durationMin: 90,
      byType: [
        ['upper', 2],
        ['lower', 1],
      ],
    });
  });

  it('за несколько месяцев считает их вместе', () => {
    expect(monthStats(workouts, 2026, 10, 2)).toMatchObject({ count: 4, tonnage: 2500 });
  });

  it('пустой месяц дает нули', () => {
    expect(monthStats(workouts, 2026, 0)).toMatchObject({ count: 0, tonnage: 0, byType: [] });
  });

  it('тоннаж по месяцам идет по порядку и через границу года', () => {
    expect(monthlyTonnage([workout('2025-12-05', 'upper', [set(10, 10)])], 2026, 0, 2)).toEqual([
      { date: '2025-12-01', value: 100 },
      { date: '2026-01-01', value: 0 },
    ]);
  });
});

describe('цель месяца', () => {
  it('считает долю и не выходит за 100', () => {
    expect(goalPercent(3, 12)).toBe(25);
    expect(goalPercent(20, 12)).toBe(100);
    expect(goalPercent(3, 0)).toBe(0);
  });
});
