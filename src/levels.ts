import type { Sex } from './formulas';

export const LEVEL_NAMES = ['novice', 'beginner', 'intermediate', 'advanced', 'elite'] as const;
export type Level = (typeof LEVEL_NAMES)[number];

// Отношение 1ПМ к весу тела для уровней. Значения приблизительные, по мотивам открытых таблиц
// силовых нормативов для мужчин (ExRx, Strength Level). Таблицу легко поправить здесь.
export const STANDARDS: Record<string, number[]> = {
  'Жим лежа': [0.5, 0.75, 1.25, 1.75, 2],
  'Приседания со штангой': [0.75, 1.25, 1.5, 2.25, 2.75],
  'Становая тяга': [1, 1.5, 2, 2.5, 3],
  'Жим штанги стоя': [0.35, 0.55, 0.8, 1.1, 1.4],
  Подтягивания: [1, 1.2, 1.4, 1.7, 2],
  'Румынская тяга': [0.75, 1.1, 1.5, 2, 2.4],
};

// У женщин те же уровни при меньшем отношении силы к весу тела
const FEMALE_FACTOR = 0.65;

export interface LevelResult {
  level: Level | undefined;
  next?: Level;
  // Сколько кг 1ПМ не хватает до следующего уровня
  missingKg?: number;
}

export function strengthLevel(
  exerciseName: string,
  oneRepMaxKg: number,
  bodyKg: number,
  sex: Sex,
): LevelResult | undefined {
  const standards = STANDARDS[exerciseName];
  if (!standards) {
    return undefined;
  }
  const factor = sex === 'female' ? FEMALE_FACTOR : 1;
  const required = standards.map((ratio) => ratio * factor * bodyKg);
  const reached = required.filter((value) => oneRepMaxKg >= value).length;
  const next = reached < LEVEL_NAMES.length ? LEVEL_NAMES[reached] : undefined;

  return {
    level: reached > 0 ? LEVEL_NAMES[reached - 1] : undefined,
    next,
    missingKg: next ? Math.round((required[reached] - oneRepMaxKg) * 10) / 10 : undefined,
  };
}
