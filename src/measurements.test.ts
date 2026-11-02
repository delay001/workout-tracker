import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  deleteMeasurement,
  getMeasurements,
  latestChange,
  measurementSeries,
  saveMeasurement,
} from './measurements';

beforeEach(async () => {
  await db.measurements.clear();
});

describe('замеры', () => {
  it('сохраняет только заполненные поля и понимает запятую', async () => {
    await saveMeasurement('2026-11-02', { waist: '82,5', neck: ' ', chest: '110' });

    expect(await getMeasurements()).toEqual([
      { date: '2026-11-02', values: { waist: 82.5, chest: 110 } },
    ]);
  });

  it('сортирует по дате, повторная запись за день заменяет', async () => {
    await saveMeasurement('2026-11-02', { waist: '82' });
    await saveMeasurement('2026-10-01', { waist: '84' });
    await saveMeasurement('2026-11-02', { waist: '81' });

    expect((await getMeasurements()).map((item) => [item.date, item.values.waist])).toEqual([
      ['2026-10-01', 84],
      ['2026-11-02', 81],
    ]);
  });

  it('не принимает пустую запись и не число', async () => {
    await expect(saveMeasurement('2026-11-02', { waist: '' })).rejects.toThrow('хотя бы один');
    await expect(saveMeasurement('2026-11-02', { waist: 'абв' })).rejects.toThrow('Талия');
  });

  it('удаляет запись', async () => {
    await saveMeasurement('2026-11-02', { waist: '82' });

    await deleteMeasurement('2026-11-02');

    expect(await getMeasurements()).toEqual([]);
  });

  it('ряд для графика пропускает даты без этого замера', () => {
    const series = measurementSeries(
      [
        { date: '2026-10-01', values: { waist: 84 } },
        { date: '2026-10-15', values: { chest: 110 } },
        { date: '2026-11-02', values: { waist: 82 } },
      ],
      'waist',
    );

    expect(series).toEqual([
      { date: '2026-10-01', value: 84 },
      { date: '2026-11-02', value: 82 },
    ]);
  });

  it('считает изменение к прошлому замеру', () => {
    const change = latestChange([
      { date: '2026-10-01', value: 84.3 },
      { date: '2026-11-02', value: 82.1 },
    ]);

    expect(change).toBe(-2.2);
    expect(latestChange([{ date: '2026-10-01', value: 84 }])).toBeUndefined();
  });
});
