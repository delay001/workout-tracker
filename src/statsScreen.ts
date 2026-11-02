import { lineChart } from './chart';
import { formatDuration, formatMonth, shiftMonth } from './dates';
import { h } from './dom';
import { getMonthlyGoal } from './settings';
import { goalPercent, monthlyTonnage, monthStats } from './stats';
import { getFinishedWorkouts, workoutTypeName } from './workouts';

const now = new Date();
let shown = { year: now.getFullYear(), month: now.getMonth() };

export function goalBar(count: number, goal: number): HTMLElement {
  const fill = h('div', { className: 'progress-fill' });
  // Ширина задаётся кадром позже, чтобы полоса плавно заполнилась при показе
  requestAnimationFrame(() => {
    fill.style.width = `${goalPercent(count, goal)}%`;
  });

  return h(
    'div',
    { className: 'progress' },
    h('p', {}, `Цель месяца: ${count} из ${goal}`),
    h(
      'div',
      {
        className: 'progress-track',
        role: 'progressbar',
        ariaValueNow: String(count),
        ariaValueMax: String(goal),
        ariaLabel: 'Цель месяца',
      },
      fill,
    ),
  );
}

export async function renderStatsScreen(root: HTMLElement): Promise<void> {
  const workouts = await getFinishedWorkouts();
  const goal = await getMonthlyGoal();

  function show(): void {
    const stats = monthStats(workouts, shown.year, shown.month);

    const monthButton = (label: string, name: string, delta: number): HTMLButtonElement =>
      h(
        'button',
        {
          type: 'button',
          className: 'step-button',
          ariaLabel: name,
          onclick: () => {
            shown = shiftMonth(shown.year, shown.month, delta);
            show();
          },
        },
        label,
      );

    const tile = (value: string, label: string): HTMLElement =>
      h('div', { className: 'stat' }, h('strong', {}, value), label);

    root.replaceChildren(
      h('h1', {}, 'Статистика'),
      h(
        'div',
        { className: 'month-nav' },
        monthButton('‹', 'Предыдущий месяц', -1),
        h('h2', {}, formatMonth(shown.year, shown.month)),
        monthButton('›', 'Следующий месяц', 1),
      ),
      goalBar(stats.count, goal),
      h(
        'div',
        { className: 'stats' },
        tile(String(stats.count), 'тренировок'),
        tile(stats.tonnage.toLocaleString('ru-RU'), 'кг тоннаж'),
        tile(String(stats.sets), 'рабочих подходов'),
        tile(formatDuration(stats.durationMin), 'часов в зале'),
      ),
      h('h2', {}, 'По типам'),
      ...(stats.byType.length > 0
        ? stats.byType.map(([type, count]) =>
            h('p', { className: 'set-row' }, workoutTypeName(type), h('strong', {}, String(count))),
          )
        : [h('p', { className: 'hint' }, 'В этом месяце тренировок нет')]),
      h('h2', {}, 'Тоннаж за полгода'),
      lineChart(monthlyTonnage(workouts, shown.year, shown.month, 6), 'кг', 'Тоннаж по месяцам', (date) => {
        const [year, month] = date.split('-').map(Number);
        return formatMonth(year, month - 1);
      }),
    );
  }

  show();
}
