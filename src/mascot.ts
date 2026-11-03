import { h } from './dom';
import { t } from './i18n';

export const MASCOTS = ['dumbbell', 'runner', 'dog', 'turtle', 'dino', 'cat'] as const;
export type Mascot = (typeof MASCOTS)[number] | 'none';

// Эмодзи на телефонах смотрят влево, Гантелька нарисована лицом вправо
const EMOJI: Record<Exclude<Mascot, 'none' | 'dumbbell'>, string> = {
  runner: '🏃',
  dog: '🐕',
  turtle: '🐢',
  dino: '🦖',
  cat: '🐈',
};

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

const DUMBBELL = `<svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
  <path class="mascot-leg mascot-leg-a" d="M14 17 L13 27 L16 28"/>
  <path class="mascot-leg mascot-leg-b" d="M18 17 L19 27 L22 28"/>
  <rect class="mascot-handle" x="8" y="12" width="16" height="5" rx="2"/>
  <rect class="mascot-plate" x="2" y="6" width="8" height="17" rx="3"/>
  <rect class="mascot-plate" x="22" y="6" width="8" height="17" rx="3"/>
  <circle class="mascot-eye" cx="27" cy="11" r="2.2"/>
  <circle class="mascot-pupil" cx="27.8" cy="11" r="1"/>
</svg>`;

// Маскот бегает по верхней границе панели вкладок. Нажатие: разворот или прыжок, наугад.
export function mountMascot(bar: HTMLElement, kind: Mascot): void {
  if (kind === 'none') return;
  const body = h('span', { className: 'mascot-body' });
  if (kind === 'dumbbell') body.innerHTML = DUMBBELL;
  else body.textContent = EMOJI[kind];
  const face = h('span', { className: 'mascot-face' }, body);
  const mascot = h(
    'button',
    { type: 'button', className: `mascot mascot-${kind === 'dumbbell' ? 'drawn' : 'emoji'}`, ariaLabel: t('mascot.label') },
    face,
  );
  bar.append(mascot);

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let runner: Runner = { x: Math.random() * Math.max(0, bar.clientWidth - SIZE), direction: Math.random() < 0.5 ? 1 : -1 };
  let restUntil = 0;
  let last = performance.now();

  const render = (running: boolean): void => {
    mascot.style.left = `${runner.x}px`;
    // Эмодзи по умолчанию смотрят влево, поэтому отражаются при беге вправо, а Гантелька наоборот
    const flipped = kind === 'dumbbell' ? runner.direction === -1 : runner.direction === 1;
    mascot.classList.toggle('mascot-flip', flipped);
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
