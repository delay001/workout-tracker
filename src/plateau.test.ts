import { describe, expect, it } from 'vitest';
import type { Exercise, Workout, WorkoutSet } from './db';
import { DEFAULT_NORMS } from './volume';
import { findPlateaus, plateauHints } from './plateau';

const set = (weight: number, reps: number, extra: Partial<WorkoutSet> = {}): WorkoutSet => ({ weight, reps, warmup: false, ...extra });

let nextId = 1;
const workout = (date: string, sets: WorkoutSet[], rating?: number): Workout => ({
  id: nextId++,
  date,
  type: 'upper',
  status: 'finished',
  rating,
  exercises: [{ exerciseId: 1, sets }],
  exerciseIds: [1],
});

const TODAY = '2026-11-04';

describe('findPlateaus', () => {
  it('finds an exercise without a new 1RM record for 4+ weeks', () => {
    const workouts = [
      workout('2026-09-01', [set(80, 8)]),
      workout('2026-09-20', [set(90, 8)]),
      workout('2026-10-01', [set(90, 6)]),
      workout('2026-10-15', [set(85, 8)]),
      workout('2026-11-01', [set(90, 7)]),
    ];
    expect(findPlateaus(workouts, TODAY)).toEqual([{ exerciseId: 1, since: '2026-09-20', days: 45, times: 3, best: 114 }]);
  });

  it('no plateau while results grow', () => {
    const workouts = [
      workout('2026-09-01', [set(80, 8)]),
      workout('2026-09-20', [set(82.5, 8)]),
      workout('2026-10-10', [set(85, 8)]),
      workout('2026-11-01', [set(87.5, 8)]),
    ];
    expect(findPlateaus(workouts, TODAY)).toEqual([]);
  });

  it('needs at least 3 workouts after the last record', () => {
    const workouts = [workout('2026-09-01', [set(90, 8)]), workout('2026-10-01', [set(80, 8)]), workout('2026-11-01', [set(80, 8)])];
    expect(findPlateaus(workouts, TODAY)).toEqual([]);
  });

  it('ignores exercises not done recently and warmups', () => {
    const old = [
      workout('2026-06-01', [set(90, 8)]),
      workout('2026-07-01', [set(80, 8)]),
      workout('2026-07-10', [set(80, 8)]),
      workout('2026-07-20', [set(80, 8)]),
    ];
    expect(findPlateaus(old, TODAY)).toEqual([]);

    // Тяжелая разминка не считается рекордом
    const warmup = [
      workout('2026-09-01', [set(80, 8)]),
      workout('2026-10-01', [set(82.5, 8), set(200, 1, { warmup: true })]),
      workout('2026-10-20', [set(85, 8)]),
    ];
    expect(findPlateaus(warmup, TODAY)).toEqual([]);
  });
});

describe('plateauHints', () => {
  const exercises: Exercise[] = [{ id: 1, name: 'Жим лежа', nameKey: 'жим лежа', primaryMuscle: 'chest', secondaryMuscles: [] }];

  it('reports low volume, no failure sets and a rating drop', () => {
    const workouts = [
      workout('2026-09-20', [set(90, 8)], 8),
      workout('2026-10-15', [set(85, 8), set(85, 8)], 6),
      workout('2026-10-25', [set(85, 8)], 6),
      workout('2026-11-01', [set(90, 7)], 7),
    ];
    const [plateau] = findPlateaus(workouts, TODAY);
    const hints = plateauHints(plateau, workouts, exercises, DEFAULT_NORMS, TODAY);
    expect(hints).toMatchObject({
      muscle: 'chest',
      weeklySets: 1,
      volume: 'low',
      averageReps: 7.8,
      failureSets: 0,
      workingSets: 4,
      intensity: 'noFailure',
      ratingNow: 6.3,
      ratingBefore: 8,
      recovery: 'ratingDrop',
    });
  });
});
