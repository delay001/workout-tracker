import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, evaluateAchievements, newAchievements } from './achievements';
import type { Exercise, Workout } from './db';
import { strengthLevel } from './levels';
import { motivationMessage } from './motivation';
import { availableYears, yearSummary } from './yearSummary';

function workout(date: string, weight = 100, reps = 5, durationMin = 60, type = 'upper', exerciseId = 1): Workout {
  return {
    id: 1,
    date,
    type,
    status: 'finished',
    durationMin,
    exercises: [{ exerciseId, sets: [{ weight, reps, warmup: false }] }],
    exerciseIds: [exerciseId],
  };
}

const state = (workouts: Workout[], id: string, goal = false) =>
  evaluateAchievements(workouts, '2026-11-20', goal).find((item) => item.id === id);

describe('уровни', () => {
  it('определяет уровень и остаток до следующего', () => {
    expect(strengthLevel('Жим лежа', 100, 80, 'male')).toEqual({
      level: 'intermediate',
      next: 'advanced',
      missingKg: 40,
    });
  });

  it('ниже первого порога уровня нет', () => {
    expect(strengthLevel('Жим лежа', 30, 80, 'male')?.level).toBeUndefined();
  });

  it('на верхнем уровне следующего нет', () => {
    expect(strengthLevel('Жим лежа', 200, 80, 'male')).toEqual({ level: 'elite', next: undefined, missingKg: undefined });
  });

  it('упражнения без таблицы не получают уровень', () => {
    expect(strengthLevel('Молотки', 30, 80, 'male')).toBeUndefined();
  });

  it('для женщин пороги ниже', () => {
    expect(strengthLevel('Жим лежа', 60, 80, 'female')?.level).toBe('beginner');
  });
});

describe('ачивки', () => {
  const eight = Array.from({ length: 8 }, (_, index) => workout(`2026-10-${String(index + 1).padStart(2, '0')}`));

  it('месячная ачивка считается по месяцам', () => {
    const nextMonth = Array.from({ length: 8 }, (_, index) => workout(`2026-11-${String(index + 1).padStart(2, '0')}`));

    expect(state([...nextMonth, ...eight], 'month8')?.count).toBe(2);
  });

  it('показывает прогресс текущего месяца', () => {
    expect(state([workout('2026-11-01'), workout('2026-11-02')], 'month10')).toMatchObject({ value: 2, target: 10, count: 0 });
  });

  it('разовая выдается один раз', () => {
    const many = Array.from({ length: 12 }, () => workout('2026-10-01'));

    expect(state(many, 'total10')?.count).toBe(1);
  });

  it('считает рекорды', () => {
    expect(state([workout('2026-10-02', 110), workout('2026-10-01', 100)], 'record1')?.count).toBe(1);
  });

  it('цель по весу', () => {
    expect(state([], 'weightGoal', true)?.count).toBe(1);
  });

  it('серия недель с двумя тренировками', () => {
    const weeks = ['2026-11-16', '2026-11-17', '2026-11-09', '2026-11-10', '2026-11-02', '2026-11-03', '2026-10-26', '2026-10-27'];

    expect(state(weeks.map((date) => workout(date)), 'streak4')?.count).toBe(1);
  });

  it('новая ачивка определяется один раз', () => {
    const states = evaluateAchievements(eight, '2026-11-20', false);

    expect(newAchievements(states, {}).map((item) => item.id)).toContain('month8');
    expect(newAchievements(states, { month8: 1 }).map((item) => item.id)).not.toContain('month8');
  });

  it('у каждой ачивки свой идентификатор', () => {
    expect(new Set(ACHIEVEMENTS.map((item) => item.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('итоги года', () => {
  const exercises: Exercise[] = [{ id: 1, name: 'Жим', nameKey: 'жим' }];

  it('считает показатели выбранного года', () => {
    const workouts = [
      workout('2026-02-01', 110, 5, 60, 'lower'),
      workout('2026-01-01', 100, 5, 120),
      workout('2025-01-01', 200),
    ];
    const weights = [
      { date: '2026-01-01', kg: 90 },
      { date: '2026-06-01', kg: 85 },
    ];

    expect(yearSummary(workouts, exercises, weights, 2026)).toMatchObject({
      workouts: 2,
      hours: 3,
      tonnage: 1050,
      favourite: 'Жим',
      weightChange: -5,
      upper: 1,
      lower: 1,
      records: 1,
    });
  });

  it('текущий год доступен только с 15 декабря', () => {
    expect(availableYears([2025, 2026], '2026-11-20')).toEqual([2025]);
    expect(availableYears([2025, 2026], '2026-12-15')).toEqual([2026, 2025]);
  });
});

describe('мотивация', () => {
  it('поздравляет в день выполнения цели', () => {
    expect(motivationMessage(10, 10)).toContain('Цель месяца');
  });

  it('иначе выбирает фразу', () => {
    expect(motivationMessage(3, 10, 0)).not.toContain('Цель месяца');
  });
});
