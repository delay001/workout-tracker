import { describe, expect, it } from 'vitest';
import { t } from './index';

describe('переводы', () => {
  it('возвращает текст по ключу', () => {
    expect(t('common.back')).toBe('Назад');
  });

  it('подставляет значения, в том числе ноль', () => {
    expect(t('backup.saved', { exercises: 0, workouts: 3 })).toBe('Сохранено: упражнений 0, тренировок 3');
  });
});
