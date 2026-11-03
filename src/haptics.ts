import { getSetting } from './settings';

export const HAPTIC_LEVELS = ['off', 'light', 'medium', 'strong'] as const;
export type HapticLevel = (typeof HAPTIC_LEVELS)[number];

// Длительность отклика на нажатие, мс: короткий импульс ощущается как «щелчок»
const TAP_MS: Record<HapticLevel, number> = { off: 0, light: 8, medium: 18, strong: 35 };
// Во сколько раз длиннее остальные вибрации (подход, рекорд) относительно средней силы
const SCALE: Record<HapticLevel, number> = { off: 0, light: 0.5, medium: 1, strong: 1.5 };

let level: HapticLevel = 'medium';

export function parseHaptics(value: string): HapticLevel {
  return (HAPTIC_LEVELS as readonly string[]).includes(value) ? (value as HapticLevel) : 'medium';
}

export function setHaptics(value: HapticLevel): void {
  level = value;
}

// Вибрация, если она не выключена в настройках. Длительность зависит от выбранной силы.
export function vibrate(ms: number): void {
  if (level === 'off') return;
  navigator.vibrate?.(Math.round(ms * SCALE[level]));
}

// Легкий отклик на любое нажатие кнопки, переключателя или флажка
export async function startHaptics(): Promise<void> {
  level = parseHaptics(await getSetting('haptics'));
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as Element | null;
      if (level !== 'off' && target?.closest('button, .chip, [role="button"], input[type="checkbox"]')) {
        navigator.vibrate?.(TAP_MS[level]);
      }
    },
    true,
  );
}
