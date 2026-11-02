export const MUSCLES = [
  'chest',
  'lats',
  'traps',
  'frontDelt',
  'sideDelt',
  'rearDelt',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
] as const;

export type Muscle = (typeof MUSCLES)[number];
export type Movement = 'push' | 'pull' | 'other';

export interface MuscleMarkup {
  primaryMuscle: Muscle;
  secondaryMuscles: Muscle[];
  movement: Movement;
}

const mark = (primaryMuscle: Muscle, movement: Movement, ...secondaryMuscles: Muscle[]): MuscleMarkup => ({
  primaryMuscle,
  secondaryMuscles,
  movement,
});

// Разметка упражнений каталога: основная мышца, тип движения, вспомогательные мышцы (до трёх)
export const CATALOG_MARKUP: Record<string, MuscleMarkup> = {
  'Жим лёжа': mark('chest', 'push', 'triceps', 'frontDelt'),
  'Жим гантелей под 45': mark('chest', 'push', 'frontDelt', 'triceps'),
  'Жим гантелей под 30–35': mark('chest', 'push', 'frontDelt', 'triceps'),
  'Жим под 45 в тренажёре': mark('chest', 'push', 'frontDelt', 'triceps'),
  'Жим под 35 в Хамере': mark('chest', 'push', 'frontDelt', 'triceps'),
  Бабочка: mark('chest', 'push', 'frontDelt'),

  'Тяга верхнего блока': mark('lats', 'pull', 'biceps', 'rearDelt'),
  'Верхняя тяга в тренажёре': mark('lats', 'pull', 'biceps', 'rearDelt'),
  'Вертикальная тяга в Хамере': mark('lats', 'pull', 'biceps', 'rearDelt'),
  'Тяга горизонтального блока': mark('lats', 'pull', 'traps', 'biceps', 'rearDelt'),
  'Гребная тяга в тренажёре одной рукой': mark('lats', 'pull', 'traps', 'biceps', 'rearDelt'),
  'Гребная тяга в тренажёре двумя руками': mark('lats', 'pull', 'traps', 'biceps', 'rearDelt'),
  'Гребная тяга в Хамере': mark('lats', 'pull', 'traps', 'biceps', 'rearDelt'),
  'Тяга штанги в наклоне': mark('lats', 'pull', 'traps', 'biceps', 'hamstrings'),
  'Тяга Йейтса': mark('lats', 'pull', 'traps', 'biceps', 'rearDelt'),
  'Горизонтальная тяга в Смите': mark('lats', 'pull', 'traps', 'biceps', 'rearDelt'),
  'Тяга гантелей в наклоне': mark('lats', 'pull', 'traps', 'biceps', 'rearDelt'),
  'Карманная тяга с гантелью': mark('lats', 'pull', 'biceps'),
  'Становая тяга': mark('hamstrings', 'pull', 'glutes', 'lats', 'traps'),
  'Приседания со штангой': mark('quads', 'push', 'glutes', 'hamstrings'),
  Подтягивания: mark('lats', 'pull', 'biceps', 'forearms'),
  'Шраги с гантелями': mark('traps', 'pull', 'forearms'),
  'Шраги со штангой': mark('traps', 'pull', 'forearms'),
  Гиперэкстензия: mark('hamstrings', 'pull', 'glutes'),

  'Махи гантелей в сторону': mark('sideDelt', 'other', 'traps'),
  'Дельты в тренажёре': mark('sideDelt', 'other', 'traps'),
  'Протяжка на плечи': mark('sideDelt', 'pull', 'traps', 'biceps'),
  'Жим гантелей сидя': mark('frontDelt', 'push', 'sideDelt', 'triceps'),
  'Жим штанги стоя': mark('frontDelt', 'push', 'sideDelt', 'triceps'),
  'Обратная бабочка': mark('rearDelt', 'pull', 'traps'),
  'Махи в наклоне на заднюю дельту': mark('rearDelt', 'pull', 'traps'),

  'Супинация на бицепс': mark('biceps', 'pull', 'forearms'),
  Молотки: mark('biceps', 'pull', 'forearms'),
  'Подъём штанги на бицепс': mark('biceps', 'pull', 'forearms'),
  'Подъём на бицепс обратным хватом': mark('biceps', 'pull', 'forearms'),
  'Подъём EZ-грифа на бицепс': mark('biceps', 'pull', 'forearms'),
  'Бицепс в тренажёре': mark('biceps', 'pull'),

  'Жим блока на трицепс': mark('triceps', 'push'),
  'Разгибания сидя на трицепс': mark('triceps', 'push'),
  'Отжимания на брусьях': mark('triceps', 'push', 'chest', 'frontDelt'),
  'Жим узким хватом': mark('triceps', 'push', 'chest', 'frontDelt'),

  'Сгибание кистей со штангой': mark('forearms', 'pull'),
  'Сгибание кисти с гантелью': mark('forearms', 'pull'),

  'Разгибание ног сидя': mark('quads', 'push'),
  'Разгибание ног одной ногой': mark('quads', 'push'),
  'Сгибание ног сидя': mark('hamstrings', 'pull'),
  'Сгибание ног лёжа': mark('hamstrings', 'pull'),
  'Жим ногами в тренажёре': mark('quads', 'push', 'glutes', 'hamstrings'),
  'Румынская тяга': mark('hamstrings', 'pull', 'glutes', 'traps'),
  'Румынская тяга в Смите': mark('hamstrings', 'pull', 'glutes', 'traps'),
  'Подъём на носки стоя': mark('calves', 'push'),
  'Подъём на носки сидя': mark('calves', 'push'),
  'Разведение ног в тренажёре': mark('glutes', 'other'),

  Элипс: mark('quads', 'other'),
  Лестница: mark('quads', 'other'),
  Дорожка: mark('quads', 'other'),
  Скакалка: mark('calves', 'other'),
};

export function markupFor(name: string): Partial<MuscleMarkup> {
  return CATALOG_MARKUP[name] ?? {};
}
