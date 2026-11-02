import { ru } from './ru';

export type MessageKey = keyof typeof ru;

// Язык читается один раз при запуске: списки подписей строятся при загрузке кода,
// поэтому смена языка на этапе 2.6 будет перезапускать страницу
export const LOCALE = 'ru-RU';

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return ru[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
