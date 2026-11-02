import { t } from './i18n';

const PHRASES = [
  'motivation.1',
  'motivation.2',
  'motivation.3',
  'motivation.4',
  'motivation.5',
  'motivation.6',
] as const;

// Сообщение после завершения тренировки. В день выполнения цели месяца поздравляем особо.
export function motivationMessage(monthCount: number, goal: number, random = Math.random()): string {
  if (monthCount === goal) {
    return t('motivation.goal', { goal });
  }
  return t(PHRASES[Math.floor(random * PHRASES.length)]);
}
