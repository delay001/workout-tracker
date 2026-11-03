import { t, type MessageKey } from './i18n';

// Фразы motivation.1 … motivation.30 в словаре, выбирается случайная
const PHRASES = Array.from({ length: 30 }, (_, index) => `motivation.${index + 1}` as MessageKey);

// Сообщение после завершения тренировки. В день выполнения цели месяца поздравляем особо.
export function motivationMessage(monthCount: number, goal: number, random = Math.random()): string {
  if (monthCount === goal) {
    return t('motivation.goal', { goal });
  }
  return t(PHRASES[Math.floor(random * PHRASES.length)]);
}
