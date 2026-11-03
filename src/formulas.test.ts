import { describe, expect, it } from 'vitest';
import { activityFor, bodyMassIndex, dailyCalories, estimateOneRepMax, navyBodyFat } from './formulas';

describe('расчет 1ПМ', () => {
  it('считает три формулы и среднее', () => {
    const result = estimateOneRepMax(100, 5);

    expect(result.epley).toBe(116.7);
    expect(result.brzycki).toBe(112.5);
    expect(result.lombardi).toBe(117.5);
    expect(result.average).toBe(115.5);
  });

  it('для одного повторения все формулы дают вес', () => {
    expect(estimateOneRepMax(100, 1).average).toBe(100);
  });
});

describe('калории в день', () => {
  it('Миффлин — Сан Жеор с коэффициентом активности', () => {
    // 10·97 + 6.25·180 − 5·30 + 5 = 1950; ×1.55 = 3022.5
    expect(dailyCalories('male', 97, 180, 30, 'medium')).toBe(3020);
    // 10·60 + 6.25·165 − 5·25 − 161 = 1345.25; ×1.375 = 1849.7
    expect(dailyCalories('female', 60, 165, 25, 'low')).toBe(1850);
  });

  it('активность по тренировкам в неделю', () => {
    expect(activityFor(1)).toBe('low');
    expect(activityFor(3)).toBe('medium');
    expect(activityFor(6)).toBe('high');
  });
});

describe('ИМТ', () => {
  it('совпадает с ручным расчетом', () => {
    expect(bodyMassIndex(80, 180)).toBe(24.7);
  });
});

describe('процент жира', () => {
  it('считает мужскую формулу', () => {
    expect(navyBodyFat('male', 180, 85, 40)).toBe(14.5);
  });

  it('женской формуле нужны бедра', () => {
    expect(navyBodyFat('female', 165, 70, 33)).toBeUndefined();
    expect(navyBodyFat('female', 165, 70, 33, 98)).toBe(25.9);
  });

  it('не ломается на невозможных замерах', () => {
    expect(navyBodyFat('male', 180, 30, 40)).toBeUndefined();
  });
});
