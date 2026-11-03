import { t } from './i18n';
import type { ChartDatum } from './chart';
import { db, type BodyWeight } from './db';
import { daysBetween } from './progress';
import { getSetting, setSetting } from './settings';
import { fromWeight } from './units';

export async function getBodyWeights(): Promise<BodyWeight[]> {
  return db.bodyWeights.orderBy('date').toArray();
}

// Одна запись на день: повторная за ту же дату заменяет прежнюю
export async function saveBodyWeight(date: string, kgText: string): Promise<void> {
  const kg = Math.round(fromWeight(Number(kgText.replace(',', '.'))) * 10) / 10;
  if (kgText.trim() === '' || !Number.isFinite(kg) || kg < 20 || kg > 400) {
    throw new Error(t('weight.invalid'));
  }
  await db.bodyWeights.put({ date, kg });
}

export async function deleteBodyWeight(date: string): Promise<void> {
  await db.bodyWeights.delete(date);
}

// Тренд: среднее по записям за последние 7 дней до каждой даты
export function movingAverage(weights: BodyWeight[]): ChartDatum[] {
  return weights.map(({ date }) => {
    const recent = weights.filter((item) => {
      const days = daysBetween(item.date, date);
      return days >= 0 && days < 7;
    });
    const sum = recent.reduce((total, item) => total + item.kg, 0);
    return { date, value: Math.round((sum / recent.length) * 10) / 10 };
  });
}

// Изменение тренда за N дней. Берется ближайшая запись не позже чем N дней назад.
export function trendChange(trend: ChartDatum[], days: number): number | undefined {
  const last = trend.at(-1);
  const earlier = [...trend].reverse().find((item) => last && daysBetween(item.date, last.date) >= days);
  return last && earlier ? Math.round((last.value - earlier.value) * 10) / 10 : undefined;
}

export interface WeightGoal {
  targetKg: number;
  deadline: string;
  startKg: number;
  startDate: string;
}

export interface GoalStatus {
  leftKg: number;
  leftDays: number;
  requiredPerWeek: number;
  actualPerWeek?: number;
  status: 'onTrack' | 'behind' | 'ahead';
  percent: number;
  tooFast: boolean;
}

export function goalStatus(goal: WeightGoal, trend: ChartDatum[], today: string): GoalStatus {
  const current = trend.at(-1)?.value ?? goal.startKg;
  const leftKg = Math.round((goal.targetKg - current) * 10) / 10;
  const leftDays = Math.max(0, daysBetween(today, goal.deadline));
  const requiredPerWeek = Math.round((leftKg / Math.max(leftDays, 1)) * 70) / 10;
  const change = trendChange(trend, 14);
  const actualPerWeek = change === undefined ? undefined : Math.round((change / 2) * 10) / 10;
  const total = goal.targetKg - goal.startKg;
  const done = current - goal.startKg;
  const percent = total === 0 ? 100 : Math.min(100, Math.max(0, Math.round((done / total) * 100)));

  // Сравниваем темпы в сторону цели: для похудения оба отрицательные
  const direction = Math.sign(total) || 1;
  const gap = ((actualPerWeek ?? 0) - requiredPerWeek) * direction;
  const status = gap > 0.1 ? 'ahead' : gap < -0.1 ? 'behind' : 'onTrack';

  return {
    leftKg,
    leftDays,
    requiredPerWeek,
    actualPerWeek,
    status: actualPerWeek === undefined ? 'onTrack' : status,
    percent,
    tooFast: Math.abs(requiredPerWeek) > 1,
  };
}

export async function getWeightGoal(): Promise<WeightGoal | undefined> {
  const text = await getSetting('weightGoal');
  return text ? (JSON.parse(text) as WeightGoal) : undefined;
}

export async function getGoalHistory(): Promise<WeightGoal[]> {
  const text = await getSetting('weightGoalHistory');
  return text ? (JSON.parse(text) as WeightGoal[]) : [];
}

// Новая цель заменяет активную, а прежняя уходит в историю
export async function saveWeightGoal(targetText: string, deadline: string, currentKg: number, today: string): Promise<void> {
  const targetKg = Math.round(fromWeight(Number(targetText.replace(',', '.'))) * 10) / 10;
  if (targetText.trim() === '' || !Number.isFinite(targetKg) || targetKg < 20 || targetKg > 400) {
    throw new Error(t('weight.invalid'));
  }
  if (!deadline || deadline <= today) {
    throw new Error(t('goal.invalidDate'));
  }
  const old = await getWeightGoal();
  if (old) {
    await setSetting('weightGoalHistory', JSON.stringify([...(await getGoalHistory()), old]));
  }
  await setSetting('weightGoal', JSON.stringify({ targetKg, deadline, startKg: currentKg, startDate: today }));
}

export async function finishWeightGoal(): Promise<void> {
  const old = await getWeightGoal();
  if (old) {
    await setSetting('weightGoalHistory', JSON.stringify([...(await getGoalHistory()), old]));
    await setSetting('weightGoal', '');
  }
}
