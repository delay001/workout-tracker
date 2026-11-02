import type { ChartDatum } from './chart';
import { db, type Measurement } from './db';

export const MEASUREMENT_FIELDS: [string, string][] = [
  ['neck', 'Шея'],
  ['waist', 'Талия'],
  ['chest', 'Грудь'],
  ['hips', 'Бёдра'],
  ['bicepsLeft', 'Бицепс Л'],
  ['bicepsRight', 'Бицепс П'],
  ['forearmLeft', 'Предплечье Л'],
  ['forearmRight', 'Предплечье П'],
  ['thighLeft', 'Бедро Л'],
  ['thighRight', 'Бедро П'],
  ['calfLeft', 'Икра Л'],
  ['calfRight', 'Икра П'],
];

export async function getMeasurements(): Promise<Measurement[]> {
  return db.measurements.orderBy('date').toArray();
}

// Пустые поля пропускаются. Одна запись на день: повторная заменяет прежнюю.
export async function saveMeasurement(date: string, texts: Record<string, string>): Promise<void> {
  const values: Record<string, number> = {};
  for (const [key, label] of MEASUREMENT_FIELDS) {
    const text = texts[key]?.trim() ?? '';
    if (text !== '') {
      const value = Number(text.replace(',', '.'));
      if (!Number.isFinite(value) || value <= 0 || value > 300) {
        throw new Error(`${label}: число в сантиметрах`);
      }
      values[key] = value;
    }
  }
  if (Object.keys(values).length === 0) {
    throw new Error('Заполни хотя бы один замер');
  }
  await db.measurements.put({ date, values });
}

export async function deleteMeasurement(date: string): Promise<void> {
  await db.measurements.delete(date);
}

export function measurementSeries(measurements: Measurement[], key: string): ChartDatum[] {
  return measurements.flatMap(({ date, values }) =>
    values[key] === undefined ? [] : [{ date, value: values[key] }],
  );
}

// Изменение последнего замера к предыдущему, с точностью до десятой
export function latestChange(series: ChartDatum[]): number | undefined {
  if (series.length < 2) {
    return undefined;
  }
  return Math.round((series[series.length - 1].value - series[series.length - 2].value) * 10) / 10;
}
