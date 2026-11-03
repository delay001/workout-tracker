import { describe, expect, it } from 'vitest';
import { bodyMassIndex, estimateOneRepMax, navyBodyFat } from './formulas';

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
