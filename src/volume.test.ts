import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Exercise, Workout, WorkoutSet } from './db';
import {
  averageVolume,
  muscleVolume,
  pushPull,
  upperLowerBalance,
  volumeStatus,
  weekStart,
} from './volume';

const set = (warmup = false): WorkoutSet => ({ weight: 50, reps: 8, warmup });

function workout(date: string, type: string, items: [number, number][]): Workout {
  return {
    id: 1,
    date,
    type,
    status: 'finished',
    exercises: items.map(([exerciseId, sets]) => ({ exerciseId, sets: Array(sets).fill(set()) })),
    exerciseIds: items.map(([id]) => id),
  };
}

const bench: Exercise = {
  id: 1,
  name: 'Жим',
  nameKey: 'жим',
  primaryMuscle: 'chest',
  secondaryMuscles: ['triceps'],
  movement: 'push',
};
const row: Exercise = { id: 2, name: 'Тяга', nameKey: 'тяга', primaryMuscle: 'lats', movement: 'pull' };

describe('объем', () => {
  it('основная мышца — 1, вспомогательная — 0,5, разминка не считается', () => {
    const workouts = [
      workout('2026-11-03', 'upper', [[1, 4]]),
      { ...workout('2026-11-04', 'upper', []), exercises: [{ exerciseId: 1, sets: [set(true), set()] }] },
    ];

    const volume = muscleVolume(workouts, [bench], '2026-11-02', '2026-11-08');

    expect(volume.chest).toBe(5);
    expect(volume.triceps).toBe(2.5);
  });

  it('считает только указанные дни', () => {
    const volume = muscleVolume([workout('2026-10-01', 'upper', [[1, 4]])], [bench], '2026-11-02', '2026-11-08');

    expect(volume.chest).toBe(0);
  });

  it('упражнение без разметки не считается', () => {
    const plain: Exercise = { id: 3, name: 'Свое', nameKey: 'свое' };

    expect(muscleVolume([workout('2026-11-03', 'upper', [[3, 4]])], [plain], '2026-11-02', '2026-11-08').chest).toBe(0);
  });

  it('среднее считается по неделям', () => {
    const workouts = [workout('2026-11-03', 'upper', [[1, 8]])];

    expect(averageVolume(workouts, [bench], '2026-11-02', 4).chest).toBe(2);
  });

  it('неделя начинается с понедельника', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02');
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
  });

  it('считает толкающие и тянущие', () => {
    const workouts = [workout('2026-11-03', 'upper', [[1, 4], [2, 6]])];

    expect(pushPull(workouts, [bench, row], '2026-11-02', '2026-11-08')).toEqual({ push: 4, pull: 6 });
  });
});

describe('нормы', () => {
  it.each([
    [0, 'none'],
    [4, 'low'],
    [10, 'ok'],
    [20, 'ok'],
    [21, 'high'],
  ])('%d подходов — %s', (sets, status) => {
    expect(volumeStatus(sets, [10, 20])).toBe(status);
  });
});

describe('баланс верх и низ', () => {
  const today = '2026-11-20';

  it('считает тренировки за период', () => {
    const workouts = [workout('2026-11-19', 'upper', []), workout('2026-11-18', 'lower', []), workout('2026-09-01', 'upper', [])];

    expect(upperLowerBalance(workouts, today, 28, 3)).toEqual({ upper: 1, lower: 1, warning: undefined });
  });

  it('предупреждает, если низа не было 14 дней', () => {
    expect(upperLowerBalance([workout('2026-11-19', 'upper', [])], today, 28, 3).warning).toBe('noLower');
  });

  it('предупреждает о перекосе хуже порога', () => {
    const workouts = [
      ...Array(4).fill(workout('2026-11-19', 'upper', [])),
      workout('2026-11-18', 'lower', []),
    ];

    expect(upperLowerBalance(workouts, today, 28, 3).warning).toBe('ratio');
  });

  it('без тренировок предупреждения нет', () => {
    expect(upperLowerBalance([], today, 28, 3).warning).toBeUndefined();
  });
});
