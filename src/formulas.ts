export type Sex = 'male' | 'female';

export interface OneRepMaxEstimate {
  epley: number;
  brzycki: number;
  lombardi: number;
  average: number;
}

const round = (value: number): number => Math.round(value * 10) / 10;

export function estimateOneRepMax(weight: number, reps: number): OneRepMaxEstimate {
  const epley = reps === 1 ? weight : weight * (1 + reps / 30);
  const brzycki = reps === 1 ? weight : (weight * 36) / (37 - reps);
  const lombardi = weight * reps ** 0.1;
  return {
    epley: round(epley),
    brzycki: round(brzycki),
    lombardi: round(lombardi),
    average: round((epley + brzycki + lombardi) / 3),
  };
}

export type Activity = 'low' | 'medium' | 'high' | 'veryHigh';

// Коэффициенты активности к базовому обмену: 1–3, 3–5, 6–7 тренировок в неделю и тяжелый физический труд
export const ACTIVITY: Record<Activity, number> = { low: 1.375, medium: 1.55, high: 1.725, veryHigh: 1.9 };

// Калории в день по формуле Миффлина — Сан Жеора, округлено до 10 ккал
export function dailyCalories(sex: Sex, kg: number, heightCm: number, age: number, activity: Activity): number {
  const base = 10 * kg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  return Math.round((base * ACTIVITY[activity]) / 10) * 10;
}

// Активность по умолчанию по среднему числу тренировок в неделю
export function activityFor(workoutsPerWeek: number): Activity {
  if (workoutsPerWeek >= 6) return 'high';
  return workoutsPerWeek >= 3 ? 'medium' : 'low';
}

export function bodyMassIndex(kg: number, heightCm: number): number {
  return round(kg / (heightCm / 100) ** 2);
}

// Формула ВМС США. Женщинам нужен еще обхват бедер.
export function navyBodyFat(
  sex: Sex,
  heightCm: number,
  waistCm: number,
  neckCm: number,
  hipsCm = 0,
): number | undefined {
  const base = sex === 'male' ? waistCm - neckCm : waistCm + hipsCm - neckCm;
  if (base <= 0 || (sex === 'female' && hipsCm <= 0)) {
    return undefined;
  }
  const density =
    sex === 'male'
      ? 1.0324 - 0.19077 * Math.log10(base) + 0.15456 * Math.log10(heightCm)
      : 1.29579 - 0.35004 * Math.log10(base) + 0.221 * Math.log10(heightCm);
  return round(495 / density - 450);
}
