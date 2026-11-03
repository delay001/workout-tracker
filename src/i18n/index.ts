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

// Формы слова по числу: «1 тренировка», «3 тренировки», «5 тренировок»
const PLURAL_INDEX: Record<Language, Partial<Record<Intl.LDMLPluralRule, number>>> = {
  ru: { one: 0, few: 1, many: 2, other: 1 },
  en: { one: 0, other: 1 },
};
const pluralRules = new Intl.PluralRules(LOCALE);

export function plural(count: number, forms: string[]): string {
  return forms[PLURAL_INDEX[LANGUAGE][pluralRules.select(count)] ?? forms.length - 1] ?? forms[0];
}

// {name} подставляет значение, {name:форма|формы|форм} — слово в нужной форме для этого числа
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return messages[key].replace(/\{(\w+)(?::([^}]+))?\}/g, (_, name: string, forms?: string) =>
    forms ? plural(Number(params[name]), forms.split('|')) : String(params[name] ?? ''),
  );
}
