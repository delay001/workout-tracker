import { describe, expect, it } from 'vitest';
import type { Workout, WorkoutSet } from './db';
import { exerciseProgress, goalPercent, monthlyTonnage, monthStats, tonnage } from './stats';

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

  it('пустой месяц даёт нули', () => {
    expect(monthStats(workouts, 2026, 0)).toMatchObject({ count: 0, tonnage: 0, byType: [] });
  });

  it('тоннаж по месяцам идёт по порядку и через границу года', () => {
    expect(monthlyTonnage([workout('2025-12-05', 'upper', [set(10, 10)])], 2026, 0, 2)).toEqual([
      { date: '2025-12-01', value: 100 },
      { date: '2026-01-01', value: 0 },
    ]);
  });
});

describe('прогресс упражнения', () => {
  it('берёт лучший вес за день и идёт от старых записей к новым', () => {
    expect(
      exerciseProgress([
        { date: '2026-10-20', sets: [set(70, 8), set(80, 5)] },
        { date: '2026-10-01', sets: [set(60, 8), set(90, 1, true)] },
      ]),
    ).toEqual([
      { date: '2026-10-01', value: 60 },
      { date: '2026-10-20', value: 80 },
    ]);
  });

  it('две тренировки за день дают одну точку', () => {
    expect(
      exerciseProgress([
        { date: '2026-10-20', sets: [set(70, 8)] },
        { date: '2026-10-20', sets: [set(80, 5)] },
      ]),
    ).toEqual([{ date: '2026-10-20', value: 80 }]);
  });
});

describe('цель месяца', () => {
  it('считает долю и не выходит за 100', () => {
    expect(goalPercent(3, 12)).toBe(25);
    expect(goalPercent(20, 12)).toBe(100);
    expect(goalPercent(3, 0)).toBe(0);
  });
});
