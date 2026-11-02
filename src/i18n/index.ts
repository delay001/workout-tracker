import { en } from './en';
import { ru } from './ru';

export type MessageKey = keyof typeof ru;
export type Language = 'ru' | 'en';

// Язык читается один раз при запуске: списки подписей строятся при загрузке кода,
// поэтому смена языка перезапускает страницу
function detectLanguage(): Language {
  if (typeof document === 'undefined') {
    return 'ru';
  }
  const saved = localStorage.getItem('language');
  if (saved === 'ru' || saved === 'en') {
    return saved;
  }
  return navigator.language.startsWith('ru') ? 'ru' : 'en';
}

export const LANGUAGE = detectLanguage();
export const LOCALE = LANGUAGE === 'ru' ? 'ru-RU' : 'en-US';

const messages: Record<MessageKey, string> = LANGUAGE === 'en' ? en : ru;

export function setLanguage(language: Language): void {
  localStorage.setItem('language', language);
  location.reload();
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
