import { db } from './db';

export type Theme = 'dark' | 'light';

export async function getSetting(key: string): Promise<string> {
  return (await db.settings.get(key))?.value ?? '';
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

const DEFAULT_MONTHLY_GOAL = 12;

export async function getMonthlyGoal(): Promise<number> {
  const goal = Number(await getSetting('monthlyGoal'));
  return Number.isInteger(goal) && goal > 0 ? goal : DEFAULT_MONTHLY_GOAL;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f6f5fb' : '#17151f');
}

export async function loadTheme(): Promise<void> {
  applyTheme((await getSetting('theme')) === 'light' ? 'light' : 'dark');
}
