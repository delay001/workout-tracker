import type { Workout } from './db';
import { shiftMonth } from './dates';
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
  | 'weightGoal'
  | 'goalMonths'
  | 'totalTonnes'
  | 'bench'
  | 'legs'
  | 'topRating'
  | 'weekWorkouts'
  | 'weekCardio'
  | 'weightLost';

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
  { id: 'streak12', metric: 'weekStreak', target: 12, monthly: false },
  { id: 'goalMonths6', metric: 'goalMonths', target: 6, monthly: false },
  { id: 'tonnageMonth100k', metric: 'monthTonnage', target: 100000, monthly: true },
  { id: 'tonnes1000', metric: 'totalTonnes', target: 1000, monthly: false },
  { id: 'total500', metric: 'totalWorkouts', target: 500, monthly: false },
  { id: 'bench100', metric: 'bench', target: 100, monthly: false },
  { id: 'bench120', metric: 'bench', target: 120, monthly: false },
  { id: 'legs200', metric: 'legs', target: 200, monthly: false },
  { id: 'rating10', metric: 'topRating', target: 10, monthly: false },
  { id: 'week3', metric: 'weekWorkouts', target: 3, monthly: false },
  { id: 'cardioWeek3', metric: 'weekCardio', target: 3, monthly: false },
  { id: 'minus5', metric: 'weightLost', target: 5, monthly: false },
];

// Данные для ачивок, которых нет в самих тренировках
export interface AchievementContext {
  weightGoalReached?: boolean;
  monthlyGoal?: number;
  // Название упражнения по номеру: для силовых ачивок
  exerciseName?: (id: number) => string | undefined;
  // На сколько кг вес меньше стартового веса цели
  weightLostKg?: number;
}

const BENCH = ['Жим лежа'];
const LEGS = ['Жим ногами в тренажере', 'Приседания со штангой'];

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
export function weekStreak(workouts: Workout[], today: string): number {
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

// Самая длинная серия недель подряд, где было хотя бы две тренировки: полученная ачивка не пропадает
function longestWeekStreak(workouts: Workout[]): number {
  const weeks = [...new Set(workouts.map((workout) => weekStart(workout.date)))]
    .filter((week) => workouts.filter((workout) => weekStart(workout.date) === week).length >= 2)
    .sort();
  let best = 0;
  let run = 0;
  weeks.forEach((week, index) => {
    run = index > 0 && shiftDays(weeks[index - 1], 7) === week ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

// Самая длинная серия месяцев подряд с выполненной целью месяца
function longestGoalMonths(monthCounts: Map<string, number>, goal: number): number {
  const done = [...monthCounts].filter(([, count]) => goal > 0 && count >= goal).map(([key]) => key).sort();
  let best = 0;
  let run = 0;
  done.forEach((key, index) => {
    const previous = index > 0 ? done[index - 1].split('-').map(Number) : undefined;
    const next = previous && shiftMonth(previous[0], previous[1] - 1, 1);
    run = next && `${next.year}-${String(next.month + 1).padStart(2, '0')}` === key ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

// Лучший рабочий вес в упражнениях из списка
function bestWeight(workouts: Workout[], names: string[], exerciseName: (id: number) => string | undefined): number {
  return Math.max(
    0,
    ...workouts.flatMap((workout) =>
      workout.exercises
        .filter((item) => names.includes(exerciseName(item.exerciseId) ?? ''))
        .flatMap((item) => item.sets.filter((set) => !set.warmup && set.reps > 0).map((set) => set.weight)),
    ),
  );
}

// Больше всего тренировок (всех или только кардио) за одну неделю
function bestWeek(workouts: Workout[]): number {
  const weeks = new Map<string, number>();
  for (const workout of workouts) {
    const week = weekStart(workout.date);
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }
  return Math.max(0, ...weeks.values());
}

// workouts идут от новых к старым, как в истории
export function evaluateAchievements(
  workouts: Workout[],
  today: string,
  context: AchievementContext = {},
): AchievementState[] {
  const exerciseName = context.exerciseName ?? (() => undefined);
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
    weekStreak: longestWeekStreak(workouts),
    weightGoal: context.weightGoalReached ? 1 : 0,
    goalMonths: longestGoalMonths(
      new Map([...months].map(([key, month]) => [key, month.monthWorkouts])),
      context.monthlyGoal ?? 0,
    ),
    totalTonnes: Math.floor(tonnage(workouts.flatMap((workout) => workout.exercises).flatMap((item) => item.sets)) / 1000),
    bench: bestWeight(workouts, BENCH, exerciseName),
    legs: bestWeight(workouts, LEGS, exerciseName),
    topRating: Math.max(0, ...workouts.map((workout) => workout.rating ?? 0)),
    weekWorkouts: bestWeek(workouts),
    weekCardio: bestWeek(workouts.filter((workout) => workout.type === 'cardio')),
    weightLost: Math.max(0, Math.floor((context.weightLostKg ?? 0) * 10) / 10),
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
