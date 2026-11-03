import { describe, expect, it } from 'vitest';
import { CATALOG, guessMuscleGroup, MUSCLE_GROUPS } from './catalog';

describe('каталог', () => {
  it('у каждого упражнения группа из общего списка', () => {
    for (const item of CATALOG) {
      expect(MUSCLE_GROUPS).toContain(item.group);
    }
  });

  it('названия и другие варианты не повторяются', () => {
    const keys = CATALOG.flatMap((item) => [item.name, ...(item.aliases ?? [])]).map((name) => name.toLowerCase());

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('угадывание группы мышц', () => {
  it.each([
    ['Сгибание на бицепс сидя', 'Бицепс'],
    ['Французский жим на трицепс', 'Трицепс'],
    ['Жим ногами лежа', 'Ноги'],
    ['Приседания со штангой', 'Ноги'],
    ['Махи на дельту', 'Плечи'],
    ['Тяга к поясу', 'Спина'],
    ['Жим в тренажере', 'Грудь'],
  ])('«%s» → %s', (name, group) => {
    expect(guessMuscleGroup(name)).toBe(group);
  });

  it('если подсказки нет, группа остается пустой', () => {
    expect(guessMuscleGroup('Армрестлинг')).toBeUndefined();
  });
});
