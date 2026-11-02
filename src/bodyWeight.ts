import { db, type BodyWeight } from './db';

export async function getBodyWeights(): Promise<BodyWeight[]> {
  return db.bodyWeights.orderBy('date').toArray();
}

// Одна запись на день: повторная за ту же дату заменяет прежнюю
export async function saveBodyWeight(date: string, kgText: string): Promise<void> {
  const kg = Number(kgText.replace(',', '.'));
  if (!Number.isFinite(kg) || kg <= 0 || kg > 400) {
    throw new Error('Вес: число в килограммах');
  }
  await db.bodyWeights.put({ date, kg });
}

export async function deleteBodyWeight(date: string): Promise<void> {
  await db.bodyWeights.delete(date);
}

export interface ChartPoint extends BodyWeight {
  x: number;
  y: number;
}

export interface ChartBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function day(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

// Координаты на графике: ось X идёт по датам, поэтому пропуски между записями видны
export function chartPoints(weights: BodyWeight[], box: ChartBox): ChartPoint[] {
  if (weights.length === 0) {
    return [];
  }
  const firstDay = day(weights[0].date);
  const daySpan = day(weights[weights.length - 1].date) - firstDay || 1;
  const min = Math.min(...weights.map((item) => item.kg));
  const kgSpan = Math.max(...weights.map((item) => item.kg)) - min || 1;

  return weights.map((item) => ({
    ...item,
    x: box.left + ((day(item.date) - firstDay) / daySpan) * (box.right - box.left),
    y: box.bottom - ((item.kg - min) / kgSpan) * (box.bottom - box.top),
  }));
}
