import { describe, expect, it } from 'vitest';
import { en } from './en';
import { t } from './index';
import { ru } from './ru';

describe('переводы', () => {
  it('в английском словаре нет пустых строк и те же подстановки', () => {
    for (const key of Object.keys(ru) as (keyof typeof ru)[]) {
      expect(en[key], key).toBeTruthy();
      const params = (text: string): string[] => (text.match(/\{\w+\}/g) ?? []).sort();
      expect(params(en[key]), key).toEqual(params(ru[key]));
    }
  });

  it('возвращает текст по ключу', () => {
    expect(t('common.back')).toBe('Назад');
  });

  it('подставляет значения, в том числе ноль', () => {
    expect(t('backup.saved', { exercises: 0, workouts: 3 })).toBe('Сохранено: 0 упражнений, 3 тренировки');
  });

  it.each([
    [1, '1 день'],
    [2, '2 дня'],
    [5, '5 дней'],
    [11, '11 дней'],
    [21, '21 день'],
    [254, '254 дня'],
  ])('склоняет слово по числу: %d', (days, text) => {
    expect(t('stats.overdueRow', { days })).toBe(text);
  });
});
