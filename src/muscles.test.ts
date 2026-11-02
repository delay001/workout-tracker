import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { importData } from './backup';
import { CATALOG } from './catalog';
import { db, findOrCreateExercise, markUpExercises } from './db';
import { CATALOG_MARKUP, MUSCLES } from './muscles';
import { t } from './i18n';

beforeEach(async () => {
  await db.exercises.clear();
});

describe('справочник мышц', () => {
  it('в справочнике 14 мышц, у каждой есть название', () => {
    expect(MUSCLES).toHaveLength(14);
    for (const muscle of MUSCLES) {
      expect(t(`muscle.${muscle}`)).not.toBe('');
    }
  });

  it('размечено каждое упражнение каталога, вспомогательных не больше трёх', () => {
    for (const { name } of CATALOG) {
      const markup = CATALOG_MARKUP[name];

      expect(markup, name).toBeDefined();
      expect(markup.secondaryMuscles.length, name).toBeLessThanOrEqual(3);
      expect(markup.secondaryMuscles, name).not.toContain(markup.primaryMuscle);
    }
  });

  it('в разметке нет лишних названий', () => {
    const names = CATALOG.map((item) => item.name);

    expect(Object.keys(CATALOG_MARKUP).filter((name) => !names.includes(name))).toEqual([]);
  });
});

describe('разметка упражнений', () => {
  it('новое упражнение из каталога сразу размечено', async () => {
    const { id } = await findOrCreateExercise('Жим лёжа', 'Грудь');

    expect(await db.exercises.get(id)).toMatchObject({ primaryMuscle: 'chest', movement: 'push' });
  });

  it('своё упражнение остаётся без разметки', async () => {
    const { id } = await findOrCreateExercise('Армрестлинг');

    expect((await db.exercises.get(id))?.primaryMuscle).toBeUndefined();
  });

  it('старые записи размечаются при запуске, данные не меняются', async () => {
    const id = await db.exercises.add({ name: 'Молотки', nameKey: 'молотки', muscleGroup: 'Бицепс' });

    await markUpExercises();

    expect(await db.exercises.get(id)).toMatchObject({
      name: 'Молотки',
      muscleGroup: 'Бицепс',
      primaryMuscle: 'biceps',
      movement: 'pull',
    });
  });

  it('уже заполненная разметка не перезаписывается', async () => {
    const id = await db.exercises.add({
      name: 'Молотки',
      nameKey: 'молотки',
      primaryMuscle: 'forearms',
      secondaryMuscles: [],
      movement: 'other',
    });

    await markUpExercises();

    expect((await db.exercises.get(id))?.primaryMuscle).toBe('forearms');
  });

  it('упражнения из старой резервной копии тоже размечаются', async () => {
    await importData({
      app: 'workout-tracker',
      version: 3,
      exportedAt: '',
      exercises: [{ id: 1, name: 'Молотки', nameKey: 'молотки' }],
      workouts: [],
      workoutTypes: [],
      settings: [],
      templates: [],
      bodyWeights: [],
      measurements: [],
    });
    await markUpExercises();

    expect((await db.exercises.get(1))?.primaryMuscle).toBe('biceps');
  });
});
