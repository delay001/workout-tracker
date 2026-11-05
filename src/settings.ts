import { db } from './db';
import { DEFAULT_STEP_GOAL } from './steps';
import { setUnits } from './units';

export type Theme = 'dark' | 'light' | 'system';

export const ACCENTS = ['pink', 'orange', 'green', 'blue', 'violet', 'red'] as const;
export type Accent = (typeof ACCENTS)[number];

const DEFAULT_MONTHLY_GOAL = 12;
const DEFAULT_OVERDUE_DAYS = 21;
const DEFAULT_WEIGHT_STEP = 5;

let chosenTheme: Theme = 'dark';

export async function getSetting(key: string): Promise<string> {
  return (await db.settings.get(key))?.value ?? '';
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export async function getMonthlyGoal(): Promise<number> {
  const goal = Number(await getSetting('monthlyGoal'));
  return Number.isInteger(goal) && goal > 0 ? goal : DEFAULT_MONTHLY_GOAL;
}

export async function getStepGoal(): Promise<number> {
  const goal = Number(await getSetting('stepGoal'));
  return Number.isInteger(goal) && goal > 0 ? goal : DEFAULT_STEP_GOAL;
}

export async function getWeightStep(): Promise<number> {
  const step = Number(await getSetting('weightStep'));
  return step > 0 ? step : DEFAULT_WEIGHT_STEP;
}

export async function getOverdueDays(): Promise<number> {
  const days = Number(await getSetting('overdueDays'));
  return Number.isInteger(days) && days > 0 ? days : DEFAULT_OVERDUE_DAYS;
}

export function resolveTheme(theme: Theme, systemIsDark: boolean): 'dark' | 'light' {
  if (theme === 'system') {
    return systemIsDark ? 'dark' : 'light';
  }
  return theme;
}

export function parseTheme(value: string): Theme {
  return value === 'light' || value === 'system' ? value : 'dark';
}

export function parseAccent(value: string): Accent {
  return ACCENTS.find((accent) => accent === value) ?? 'pink';
}

export function applyTheme(theme: Theme): void {
  chosenTheme = theme;
  const resolved = resolveTheme(theme, matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'light' ? '#f6f5fb' : '#17151f');
}

export function applyAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent;
}

// Внешний вид и единицы из настроек. Вызывается при запуске и сразу после восстановления из копии,
// иначе цвет из копии появился бы только при следующем запуске.
export async function applySavedLook(): Promise<void> {
  applyTheme(parseTheme(await getSetting('theme')));
  applyAccent(parseAccent(await getSetting('accent')));
  setUnits(await getSetting('units'));
}

export async function loadTheme(): Promise<void> {
  await applySavedLook();

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (chosenTheme === 'system') {
      applyTheme('system');
    }
  });
}
