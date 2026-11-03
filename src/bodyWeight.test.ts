import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteBodyWeight,
  getBodyWeights,
  goalStatus,
  movingAverage,
  saveBodyWeight,
  trendChange,
} from './bodyWeight';
import { chartPoints } from './chart';
import { db } from './db';

const BOX = { left: 0, right: 100, top: 0, bottom: 50 };

beforeEach(async () => {
  await db.bodyWeights.clear();
});

describe('журнал веса', () => {
  it('сортирует по дате и понимает запятую', async () => {
    await saveBodyWeight('2026-11-02', '85,5');
    await saveBodyWeight('2026-10-01', '84');

    expect(await getBodyWeights()).toEqual([
      { date: '2026-10-01', kg: 84 },
      { date: '2026-11-02', kg: 85.5 },
    ]);
  });

  it('повторная запись за день заменяет прежнюю', async () => {
    await saveBodyWeight('2026-11-02', '85');
    await saveBodyWeight('2026-11-02', '86');

    expect(await getBodyWeights()).toEqual([{ date: '2026-11-02', kg: 86 }]);
  });

  it.each(['', '0', '-5', 'abc'])('отклоняет «%s»', async (text) => {
    await expect(saveBodyWeight('2026-11-02', text)).rejects.toThrow();
  });

  it('удаляет запись', async () => {
    await saveBodyWeight('2026-11-02', '85');

    await deleteBodyWeight('2026-11-02');

    expect(await getBodyWeights()).toEqual([]);
  });
});

describe('тренд и цель', () => {
  const weights = [
    { date: '2026-10-01', kg: 90 },
    { date: '2026-10-05', kg: 88 },
    { date: '2026-10-20', kg: 86 },
  ];

  it('тренд усредняет только последние 7 дней, пропуски не мешают', () => {
    expect(movingAverage(weights).map((item) => item.value)).toEqual([90, 89, 86]);
  });

  it('считает изменение тренда за период', () => {
    expect(trendChange(movingAverage(weights), 14)).toBe(-3);
    expect(trendChange(movingAverage(weights), 30)).toBeUndefined();
  });

  it('считает остаток, темп, долю и статус цели', () => {
    const trend = [
      { date: '2026-10-01', value: 90 },
      { date: '2026-10-15', value: 88 },
    ];
    const goal = { targetKg: 80, deadline: '2026-12-10', startKg: 90, startDate: '2026-10-01' };

    expect(goalStatus(goal, trend, '2026-10-15')).toEqual({
      leftKg: -8,
      leftDays: 56,
      requiredPerWeek: -1,
      actualPerWeek: -1,
      status: 'onTrack',
      percent: 20,
      tooFast: false,
    });
  });

  it('отстающий темп и слишком быстрая цель', () => {
    const trend = [
      { date: '2026-10-01', value: 90 },
      { date: '2026-10-15', value: 90 },
    ];
    const goal = { targetKg: 80, deadline: '2026-11-15', startKg: 90, startDate: '2026-10-01' };

    expect(goalStatus(goal, trend, '2026-10-15')).toMatchObject({ status: 'behind', tooFast: true });
  });
});

describe('график', () => {
  it('крайние точки попадают в углы, большее значение выше', () => {
    const points = chartPoints(
      [
        { date: '2026-10-01', value: 80 },
        { date: '2026-10-11', value: 90 },
      ],
      BOX,
    );

    expect(points.map(({ x, y }) => [x, y])).toEqual([
      [0, 50],
      [100, 0],
    ]);
  });

  it('ось X учитывает пропуски между датами', () => {
    const points = chartPoints(
      [
        { date: '2026-10-01', value: 80 },
        { date: '2026-10-02', value: 81 },
        { date: '2026-10-11', value: 82 },
      ],
      BOX,
    );

    expect(points[1].x).toBe(10);
  });

  it('одна запись не ломает расчет', () => {
    const [point] = chartPoints([{ date: '2026-10-01', value: 80 }], BOX);

    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
  });

  it('без записей точек нет', () => {
    expect(chartPoints([], BOX)).toEqual([]);
  });
});
