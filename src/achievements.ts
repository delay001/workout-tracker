import type { Workout } from './db';
import { shiftDays, weekStart } from './volume';
import { workoutStats, historyRecords } from './progress';
import { tonnage } from './stats';
import type { LastPerformance } from './workouts';

type Metric =
  | 'monthWorkouts'
  | 'monthHours'
  | 'monthTonnage'
  | 'workoutTonnage'
  | 'records'
  | 'totalWorkouts'
  | 'weekStreak'
  | 'weightGoal';

interface AchievementConfig {
  id: string;
  metric: Metric;
  target: number;
  // Месячные можно получать каждый месяц, разовые только один раз
  monthly: boolean;
}

// Новая ачивка добавляется одной строкой, логика не меняется
export const ACHIEVEMENTS: AchievementConfig[] = [
  { id: 'month8', metric: 'monthWorkouts', target: 8, monthly: true },
  { id: 'month10', metric: 'monthWorkouts', target: 10, monthly: true },
  { id: 'month12', metric: 'monthWorkouts', target: 12, monthly: true },
  { id: 'streak4', metric: 'weekStreak', target: 4, monthly: false },
  { id: 'streak8', metric: 'weekStreak', target: 8, monthly: false },
  { id: 'hours10', metric: 'monthHours', target: 10, monthly: true },
  { id: 'hours15', metric: 'monthHours', target: 15, monthly: true },
  { id: 'hours20', metric: 'monthHours', target: 20, monthly: true },
  { id: 'tonnage5k', metric: 'workoutTonnage', target: 5000, monthly: false },
  { id: 'tonnage10k', metric: 'workoutTonnage', target: 10000, monthly: false },
  { id: 'tonnageMonth50k', metric: 'monthTonnage', target: 50000, monthly: true },
  { id: 'record1', metric: 'records', target: 1, monthly: false },
  { id: 'record10', metric: 'records', target: 10, monthly: false },
  { id: 'record50', metric: 'records', target: 50, monthly: false },
  { id: 'total10', metric: 'totalWorkouts', target: 10, monthly: false },
  { id: 'total50', metric: 'totalWorkouts', target: 50, monthly: false },
  { id: 'total100', metric: 'totalWorkouts', target: 100, monthly: false },
  { id: 'total250', metric: 'totalWorkouts', target: 250, monthly: false },
  { id: 'weightGoal', metric: 'weightGoal', target: 1, monthly: false },
];

export interface AchievementState {
  id: string;
  // Сколько раз получена: у разовых 0 или 1
  count: number;
  // Текущий прогресс к цели
  value: number;
  target: number;
}

function countRecords(workouts: Workout[]): number {
  const histories = new Map<number, LastPerformance[]>();
  for (const workout of workouts) {
    for (const item of workout.exercises) {
      histories.set(item.exerciseId, [
        ...(histories.get(item.exerciseId) ?? []),
        { date: workout.date, sets: item.sets },
      ]);
    }
  }
  return [...histories.values()]
    .flatMap((history) => historyRecords(history).flat())
    .filter(Boolean).length;
}

// Сколько недель подряд, включая текущую или прошлую, было хотя бы две тренировки
function weekStreak(workouts: Workout[], today: string): number {
  const counts = new Map<string, number>();
  for (const workout of workouts) {
    const week = weekStart(workout.date);
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  let week = weekStart(today);
  if ((counts.get(week) ?? 0) < 2) {
    week = shiftDays(week, -7);
  }
  let streak = 0;
  while ((counts.get(week) ?? 0) >= 2) {
    streak++;
    week = shiftDays(week, -7);
  }
  return streak;
}

// workouts идут от новых к старым, как в истории
export function evaluateAchievements(
  workouts: Workout[],
  today: string,
  weightGoalReached: boolean,
): AchievementState[] {
  const months = new Map<string, { monthWorkouts: number; monthHours: number; monthTonnage: number }>();
  for (const workout of workouts) {
    const key = workout.date.slice(0, 7);
    const month = months.get(key) ?? { monthWorkouts: 0, monthHours: 0, monthTonnage: 0 };
    month.monthWorkouts += 1;
    month.monthHours += (workout.durationMin ?? 0) / 60;
    month.monthTonnage += tonnage(workout.exercises.flatMap((item) => item.sets));
    months.set(key, month);
  }
  const currentMonth = months.get(today.slice(0, 7));

  const totals: Record<Exclude<Metric, 'monthWorkouts' | 'monthHours' | 'monthTonnage'>, number> = {
    workoutTonnage: Math.max(0, ...workouts.map((workout) => workoutStats(workout).tonnage)),
    records: countRecords(workouts),
    totalWorkouts: workouts.length,
    weekStreak: weekStreak(workouts, today),
    weightGoal: weightGoalReached ? 1 : 0,
  };

  return ACHIEVEMENTS.map(({ id, metric, target, monthly }) => {
    if (monthly) {
      const key = metric as 'monthWorkouts' | 'monthHours' | 'monthTonnage';
      return {
        id,
        target,
        value: Math.floor(currentMonth?.[key] ?? 0),
        count: [...months.values()].filter((month) => month[key] >= target).length,
      };
    }
    const value = totals[metric as keyof typeof totals];
    return { id, target, value: Math.min(value, target), count: value >= target ? 1 : 0 };
  });
}

// Какие ачивки получены с прошлой проверки
export function newAchievements(
  states: AchievementState[],
  seen: Record<string, number>,
): AchievementState[] {
  return states.filter((state) => state.count > (seen[state.id] ?? 0));
}
