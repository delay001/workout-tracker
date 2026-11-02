import { lineChart } from './chart';
import { formatDuration, formatMonth, shiftMonth } from './dates';
import { h } from './dom';
import { getMonthlyGoal } from './settings';
import { goalPercent, monthlyTonnage, monthStats } from './stats';
import { getFinishedWorkouts, workoutTypeName } from './workouts';
import { LOCALE, t } from './i18n';

const now = new Date();
let shown = { year: now.getFullYear(), month: now.getMonth() };

export function goalBar(count: number, goal: number): HTMLElement {
  const fill = h('div', { className: 'progress-fill' });
  fill.style.width = `${goalPercent(count, goal)}%`;

  return h(
    'div',
    { className: 'progress' },
    h('p', {}, t('stats.goal', { count, goal })),
    h(
      'div',
      {
        className: 'progress-track',
        role: 'progressbar',
        ariaValueNow: String(count),
        ariaValueMax: String(goal),
        ariaLabel: t('stats.goalLabel'),
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
      h('h1', {}, t('tab.stats')),
      h(
        'div',
        { className: 'month-nav' },
        monthButton('‹', t('common.prevMonth'), -1),
        h('h2', {}, formatMonth(shown.year, shown.month)),
        monthButton('›', t('common.nextMonth'), 1),
      ),
      goalBar(stats.count, goal),
      h(
        'div',
        { className: 'stats' },
        tile(String(stats.count), t('stats.workouts')),
        tile(stats.tonnage.toLocaleString(LOCALE), t('stats.tonnage')),
        tile(String(stats.sets), t('stats.workingSets')),
        tile(formatDuration(stats.durationMin), t('stats.hours')),
      ),
      h('h2', {}, t('stats.byType')),
      ...(stats.byType.length > 0
        ? stats.byType.map(([type, count]) =>
            h('p', { className: 'set-row' }, workoutTypeName(type), h('strong', {}, String(count))),
          )
        : [h('p', { className: 'hint' }, t('stats.noWorkouts'))]),
      h('h2', {}, t('stats.tonnageHalfYear')),
      lineChart(monthlyTonnage(workouts, shown.year, shown.month, 6), t('unit.kg'), t('stats.tonnageByMonth'), (date) => {
        const [year, month] = date.split('-').map(Number);
        return formatMonth(year, month - 1);
      }),
    );
  }

  show();
}
