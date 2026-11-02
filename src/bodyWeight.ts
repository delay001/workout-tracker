import { db, type BodyWeight } from './db';
import { t } from './i18n';

export async function getBodyWeights(): Promise<BodyWeight[]> {
  return db.bodyWeights.orderBy('date').toArray();
}

// Одна запись на день: повторная за ту же дату заменяет прежнюю
export async function saveBodyWeight(date: string, kgText: string): Promise<void> {
  const kg = Number(kgText.replace(',', '.'));
  if (kgText.trim() === '' || !Number.isFinite(kg) || kg <= 0 || kg > 400) {
    throw new Error(t('weight.invalid'));
  }
  await db.bodyWeights.put({ date, kg });
}

export async function deleteBodyWeight(date: string): Promise<void> {
  await db.bodyWeights.delete(date);
}
