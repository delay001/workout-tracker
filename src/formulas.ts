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

export function bodyMassIndex(kg: number, heightCm: number): number {
  return round(kg / (heightCm / 100) ** 2);
}

// Формула ВМС США. Женщинам нужен ещё обхват бёдер.
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
