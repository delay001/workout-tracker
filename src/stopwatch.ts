import { confirmDialog, h } from './dom';
import { t } from './i18n';

// Секундомер хранит момент запуска, а не тикающий счетчик: время идет, даже если экран закрыт
export interface Stopwatch {
  // Когда запущен, иначе на паузе
  startedAt?: number;
  // Сколько набежало до последнего запуска, мс
  elapsed: number;
  // Длительности кругов, мс
  laps: number[];
  // Был запущен, когда открыли форму завершения: при «Назад» продолжит идти
  resumeOnBack?: boolean;
}

export const EMPTY: Stopwatch = { elapsed: 0, laps: [] };

export function total(watch: Stopwatch, now: number): number {
  return watch.elapsed + (watch.startedAt === undefined ? 0 : now - watch.startedAt);
}

export function start(watch: Stopwatch, now: number): Stopwatch {
  return watch.startedAt === undefined ? { ...watch, startedAt: now, resumeOnBack: undefined } : watch;
}

export function pause(watch: Stopwatch, now: number): Stopwatch {
  return watch.startedAt === undefined ? watch : { ...watch, elapsed: total(watch, now), startedAt: undefined };
}

// Круг — время от прошлой отметки (или от начала) до сейчас
export function lap(watch: Stopwatch, now: number): Stopwatch {
  const done = watch.laps.reduce((sum, item) => sum + item, 0);
  return { ...watch, laps: [...watch.laps, total(watch, now) - done] };
}

// Минуты для поля длительности, с округлением
export function toMinutes(ms: number): number {
  return Math.round(ms / 60_000);
}

export function formatTime(ms: number, withHours = true): string {
  const seconds = Math.floor(ms / 1000);
  const two = (value: number): string => String(value).padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  const rest = `${two(Math.floor((seconds % 3600) / 60))}:${two(seconds % 60)}`;
  return withHours || hours > 0 ? `${hours}:${rest}` : rest;
}

const key = (workoutId: number): string => `stopwatch-${workoutId}`;

// Состояние секундомера живет в браузере этого телефона, отдельно для каждой тренировки
export function loadStopwatch(workoutId: number): Stopwatch {
  try {
    const saved = localStorage.getItem(key(workoutId));
    return saved ? { ...EMPTY, ...(JSON.parse(saved) as Stopwatch) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function saveStopwatch(workoutId: number, watch: Stopwatch): void {
  try {
    localStorage.setItem(key(workoutId), JSON.stringify(watch));
  } catch {
    // Без хранилища секундомер просто не переживет перезапуск
  }
}

export function clearStopwatch(workoutId: number): void {
  try {
    localStorage.removeItem(key(workoutId));
  } catch {
    // Нечего чистить
  }
}

// Плашка секундомера: время, запуск/пауза, круг, сброс и строка кругов
export function stopwatchBar(workoutId: number): HTMLElement {
  let watch = loadStopwatch(workoutId);
  const time = h('strong', { className: 'stopwatch-time' });
  const laps = h('div', { className: 'stopwatch-laps' });
  const button = (label: string, name: string, onclick: () => void): HTMLButtonElement =>
    h('button', { type: 'button', className: 'stopwatch-button', ariaLabel: name, onclick }, label);
  const toggle = button('', '', () => {
    watch = watch.startedAt === undefined ? start(watch, Date.now()) : pause(watch, Date.now());
    update();
  });
  const lapButton = button('⚑', t('stopwatch.lap'), () => {
    watch = lap(watch, Date.now());
    update();
  });
  const reset = button('↺', t('stopwatch.reset'), async () => {
    if (await confirmDialog(t('stopwatch.resetConfirm'))) {
      watch = EMPTY;
      update();
    }
  });

  function update(): void {
    saveStopwatch(workoutId, watch);
    const running = watch.startedAt !== undefined;
    toggle.textContent = running ? '⏸' : '▶';
    toggle.ariaLabel = running ? t('stopwatch.pause') : t('stopwatch.start');
    lapButton.disabled = !running;
    reset.disabled = total(watch, Date.now()) === 0;
    tick();
    laps.hidden = watch.laps.length === 0;
    laps.replaceChildren(...watch.laps.map((item, index) => h('span', {}, `${index + 1} — ${formatTime(item, false)}`)));
    // Новый круг внизу: прокручиваем к нему
    laps.scrollTop = laps.scrollHeight;
  }

  function tick(): void {
    time.textContent = formatTime(total(watch, Date.now()));
  }

  const bar = h(
    'section',
    { className: 'stopwatch', ariaLabel: t('stopwatch.title') },
    h('div', { className: 'stopwatch-row' }, time, h('div', { className: 'stopwatch-buttons' }, toggle, lapButton, reset)),
    laps,
  );
  update();
  // Плашка уже на экране: показываем последние круги
  requestAnimationFrame(() => (laps.scrollTop = laps.scrollHeight));
  // Тикает раз в секунду, пока плашка на экране
  const timer = setInterval(() => (bar.isConnected ? tick() : clearInterval(timer)), 1000);
  return bar;
}
