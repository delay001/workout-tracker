import { db, type BodyWeight } from './db';

export async function getBodyWeights(): Promise<BodyWeight[]> {
  return db.bodyWeights.orderBy('date').toArray();
}

// Одна запись на день: повторная за ту же дату заменяет прежнюю
export async function saveBodyWeight(date: string, kgText: string): Promise<void> {
  const kg = Number(kgText.replace(',', '.'));
  if (kgText.trim() === '' || !Number.isFinite(kg) || kg <= 0 || kg > 400) {
    throw new Error('Вес: число в килограммах');
  }
  await db.bodyWeights.put({ date, kg });
}

export async function deleteBodyWeight(date: string): Promise<void> {
  await db.bodyWeights.delete(date);
}
