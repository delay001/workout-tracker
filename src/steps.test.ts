import { describe, expect, it } from 'vitest';
import { compactSteps, fillDays, monthlyAverages, periodRange, stepsSummary } from './steps';

describe('шаги', () => {
  it('период: неделя с понедельника, месяц, год, сдвиг назад', () => {
    expect(periodRange('week', 0, '2026-11-05')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(periodRange('week', -1, '2026-11-02')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(periodRange('week', 0, '2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' });
    expect(periodRange('month', -1, '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('year', 0, '2026-11-05')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('дни без данных — нули, итоги без будущих дней', () => {
    const days = fillDays('2026-11-02', '2026-11-08', [
      { date: '2026-11-02', steps: 12000 },
      { date: '2026-11-03', steps: 4000 },
      { date: '2026-11-03', steps: 1000 },
    ]);
    expect(days).toHaveLength(7);
    expect(days[1].steps).toBe(5000);
    expect(stepsSummary(days, 10000, '2026-11-04')).toEqual({
      total: 17000,
      average: 5667,
      daysMet: 1,
      best: { date: '2026-11-02', steps: 12000 },
    });
  });

  it('год: среднее в день по месяцам', () => {
    const days = fillDays('2026-01-01', '2026-12-31', [{ date: '2026-01-10', steps: 31000 }]);
    const averages = monthlyAverages(days, '2026-02-02');
    expect(averages[0]).toBe(1000);
    expect(averages[1]).toBe(0);
    expect(averages[5]).toBe(0);
  });

  it('короткая подпись', () => {
    expect(compactSteps(8234)).toBe('8,2k');
    expect(compactSteps(10000)).toBe('10k');
    expect(compactSteps(640)).toBe('640');
  });
});
