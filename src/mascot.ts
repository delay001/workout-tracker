import { h } from './dom';
import { t } from './i18n';

export const MASCOTS = ['dumbbell', 'kettlebell', 'shaker', 'plate'] as const;
export type Mascot = (typeof MASCOTS)[number] | 'none';

const SIZE = 32;
const SPEED = 45;

export function parseMascot(value: string): Mascot {
  return value === 'none' || (MASCOTS as readonly string[]).includes(value) ? (value as Mascot) : 'dumbbell';
}

export interface Runner {
  x: number;
  direction: 1 | -1;
}

// Шаг бега: у края маскот разворачивается и не выходит за полосу
export function step(runner: Runner, seconds: number, width: number): Runner {
  const max = Math.max(0, width - SIZE);
  const x = runner.x + runner.direction * SPEED * seconds;
  if (x >= max) return { x: max, direction: -1 };
  if (x <= 0) return { x: 0, direction: 1 };
  return { x, direction: runner.direction };
}

// Все маскоты нарисованы лицом вправо, у всех бегут ножки
const DRAWN: Record<Exclude<Mascot, 'none'>, string> = {
  dumbbell: `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
  <path class="mascot-leg mascot-leg-a" d="M14 17 L13 27 L16 28"/>
  <path class="mascot-leg mascot-leg-b" d="M18 17 L19 27 L22 28"/>
  <rect class="mascot-handle" x="8" y="12" width="16" height="5" rx="2"/>
  <rect class="mascot-plate" x="2" y="6" width="8" height="17" rx="3"/>
  <rect class="mascot-plate" x="22" y="6" width="8" height="17" rx="3"/>
  <circle class="mascot-eye" cx="27" cy="11" r="2.2"/>
  <circle class="mascot-pupil" cx="27.8" cy="11" r="1"/>
</svg>`,
  // Гирька: ручка сверху, круглое тело
  kettlebell: `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
  <path class="mascot-leg mascot-leg-a" d="M14 21 L13 29 L16 30"/>
  <path class="mascot-leg mascot-leg-b" d="M18 21 L19 29 L22 30"/>
  <path class="mascot-strap" d="M11 10 C11 1 21 1 21 10"/>
  <circle class="mascot-plate" cx="16" cy="15" r="9"/>
  <circle class="mascot-eye" cx="20" cy="13" r="2.2"/>
  <circle class="mascot-pupil" cx="20.8" cy="13" r="1"/>
</svg>`,
  // Шейкер для протеина: крышка с носиком и полоска этикетки
  shaker: `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
  <path class="mascot-leg mascot-leg-a" d="M14 21 L13 29 L16 30"/>
  <path class="mascot-leg mascot-leg-b" d="M18 21 L19 29 L22 30"/>
  <rect class="mascot-handle" x="14" y="1" width="4" height="4" rx="1"/>
  <rect class="mascot-handle" x="9" y="4" width="14" height="5" rx="2"/>
  <rect class="mascot-plate" x="10" y="8" width="12" height="15" rx="3"/>
  <rect class="mascot-label" x="10" y="16" width="12" height="3"/>
  <circle class="mascot-eye" cx="18" cy="13" r="2.2"/>
  <circle class="mascot-pupil" cx="18.8" cy="13" r="1"/>
</svg>`,
  // Блинчик от штанги: круг с отверстием посередине
  plate: `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
  <path class="mascot-leg mascot-leg-a" d="M14 21 L13 29 L16 30"/>
  <path class="mascot-leg mascot-leg-b" d="M18 21 L19 29 L22 30"/>
  <circle class="mascot-plate" cx="16" cy="13" r="10"/>
  <circle class="mascot-hole" cx="16" cy="13" r="3"/>
  <circle class="mascot-eye" cx="21" cy="8" r="2.2"/>
  <circle class="mascot-pupil" cx="21.8" cy="8" r="1"/>
</svg>`,
};

// Картинка маскота для выбора в настройках
export function mascotIcon(kind: Exclude<Mascot, 'none'>): string {
  return DRAWN[kind];
}

// Маскот бегает по верхней границе панели вкладок. Нажатие: разворот или прыжок, наугад.
export function mountMascot(bar: HTMLElement, kind: Mascot): void {
  if (kind === 'none') return;
  const body = h('span', { className: 'mascot-body' });
  body.innerHTML = DRAWN[kind];
  const face = h('span', { className: 'mascot-face' }, body);
  const mascot = h(
    'button',
    { type: 'button', className: 'mascot', ariaLabel: t('mascot.label') },
    face,
  );
  bar.append(mascot);

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let runner: Runner = { x: Math.random() * Math.max(0, bar.clientWidth - SIZE), direction: Math.random() < 0.5 ? 1 : -1 };
  let restUntil = 0;
  let last = performance.now();

  const render = (running: boolean): void => {
    mascot.style.left = `${runner.x}px`;
    mascot.classList.toggle('mascot-flip', runner.direction === -1);
    mascot.classList.toggle('mascot-running', running);
  };

  const jump = (): void => {
    mascot.classList.remove('mascot-jump');
    void mascot.offsetWidth;
    mascot.classList.add('mascot-jump');
  };

  mascot.onclick = () => {
    restUntil = 0;
    if (Math.random() < 0.5) {
      runner = { ...runner, direction: runner.direction === 1 ? -1 : 1 };
    } else {
      jump();
    }
  };

  const frame = (now: number): void => {
    // Панель пересоздается при смене вкладки, вместе с ней останавливается и маскот
    if (!mascot.isConnected) return;
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    const resting = still || now < restUntil;
    if (!resting) {
      runner = step(runner, seconds, bar.clientWidth);
      // Иногда останавливается передохнуть, чтобы не мельтешить
      if (Math.random() < seconds / 8) restUntil = now + 1500 + Math.random() * 2500;
    }
    render(!resting);
    requestAnimationFrame(frame);
  };
  render(false);
  requestAnimationFrame(frame);
}
