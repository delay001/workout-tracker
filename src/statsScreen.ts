import { lineChart } from './chart';
import { formatDate, formatDuration, formatMonth, shiftMonth, todayLocal } from './dates';
import { db } from './db';
import { h } from './dom';
import { renderCalcScreen } from './calcScreen';
import { overdueExercises, periodTotals, topExercises, workoutStats } from './progress';
import { formatWeight, toWeight, weightUnit } from './units';
import { getMonthlyGoal, getOverdueDays } from './settings';
import { averageRating, goalPercent, monthlyTonnage, monthStats, sortTypes, tonnage } from './stats';
import { radioChips } from './ui';
import { renderVolumeView } from './volumeScreen';
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

// Сводка за всё время, открывается с главного экрана
export async function renderTotalsScreen(root: HTMLElement, onBack: () => void): Promise<void> {
  const workouts = await getFinishedWorkouts();
  const minutes = workouts.reduce((sum, workout) => sum + (workout.durationMin ?? 0), 0);
  const allSets = workouts.flatMap((workout) => workout.exercises).flatMap((item) => item.sets);
  const rating = averageRating(workouts);
  const years = new Map<string, number>();
  for (const workout of workouts) {
    const year = workout.date.slice(0, 4);
    years.set(year, (years.get(year) ?? 0) + 1);
  }
  const row = (name: string, value: string): HTMLElement =>
    h('p', { className: 'set-row' }, name, h('strong', {}, value));

  root.replaceChildren(
    h(
      'div',
      { className: 'screen' },
      h('h1', {}, t('stats.allTime')),
      row(t('stats.allWorkouts'), String(workouts.length)),
      row(t('stats.allHours'), formatDuration(minutes)),
      row(t('stats.allTonnage'), formatWeight(tonnage(allSets))),
      row(t('stats.allRating'), rating === undefined ? '—' : String(rating)),
      ...(workouts.length > 0 ? [row(t('stats.since'), formatDate(workouts[workouts.length - 1].date))] : []),
      h('h2', {}, t('stats.perYear')),
      ...[...years].map(([year, count]) => row(year, String(count))),
      h(
        'button',
        { type: 'button', className: 'button button-secondary bottom-action', onclick: onBack },
        t('common.back'),
      ),
    ),
  );
}

let shownView: 'month' | 'week' = 'month';

export async function renderStatsScreen(root: HTMLElement): Promise<void> {
  const body = h('div');
  const showView = async (): Promise<void> => {
    if (shownView === 'month') {
      await renderMonthView(body);
    } else {
      await renderVolumeView(body);
    }
  };
  root.replaceChildren(
    h('h1', {}, t('tab.stats')),
    radioChips<'month' | 'week'>(
      'stats-view',
      t('stats.view'),
      [
        ['month', t('stats.viewMonth')],
        ['week', t('stats.viewWeek')],
      ],
      shownView,
      (value) => {
        shownView = value;
        void showView();
      },
    ),
    body,
  );
  await showView();
}

async function renderMonthView(root: HTMLElement): Promise<void> {
  const workouts = await getFinishedWorkouts();
  const goal = await getMonthlyGoal();
  const today = todayLocal();
  const totals = periodTotals(workouts, today);
  const top = topExercises(workouts, 5);
  const overdue = overdueExercises(workouts, await getOverdueDays(), today);
  const exercises = await db.exercises.toArray();
  const exerciseName = (id: number): string =>
    exercises.find((exercise) => exercise.id === id)?.name ?? '';

  const row = (name: string, value: string): HTMLElement =>
    h('p', { className: 'set-row' }, name, h('strong', {}, value));
  const topRows = top.map((item) =>
    row(exerciseName(item.exerciseId), t('stats.topRow', { count: item.count })),
  );
  // Скрытые упражнения в подсказку «давно не делал» не попадают
  const overdueRows = overdue
    .filter((item) => !exercises.find((exercise) => exercise.id === item.exerciseId)?.hidden)
    .map((item) => row(exerciseName(item.exerciseId), t('stats.overdueRow', { days: item.days })));

  function show(): void {
    const stats = monthStats(workouts, shown.year, shown.month);
    const prefix = `${shown.year}-${String(shown.month + 1).padStart(2, '0')}`;
    const monthWorkouts = workouts.filter((workout) => workout.date.startsWith(prefix));
    const rating = averageRating(monthWorkouts);
    const monthPoints = [...monthWorkouts].reverse().map((workout) => ({
      date: workout.date,
      value: toWeight(workoutStats(workout).tonnage),
    }));

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
        tile(toWeight(stats.tonnage).toLocaleString(LOCALE), t('stats.tonnage', { unit: weightUnit() })),
        tile(String(stats.sets), t('stats.workingSets')),
        tile(formatDuration(stats.durationMin), t('stats.hours')),
        tile(rating === undefined ? '—' : String(rating), t('stats.averageRating')),
        h(
          'button',
          { type: 'button', className: 'stat', onclick: () => void renderCalcScreen(root, () => show()) },
          t('stats.calc'),
        ),
      ),
      h('h2', {}, t('stats.byType')),
      ...(stats.byType.length > 0
        ? sortTypes(stats.byType).map(([type, count]) =>
            h('p', { className: 'set-row' }, workoutTypeName(type), h('strong', {}, String(count))),
          )
        : [h('p', { className: 'hint' }, t('stats.noWorkouts'))]),
      h('h2', {}, t('stats.tonnageMonth')),
      ...(monthPoints.length > 0
        ? [lineChart(monthPoints, weightUnit(), t('stats.tonnageMonth'))]
        : [h('p', { className: 'hint' }, t('stats.noWorkouts'))]),
      h('h2', {}, t('stats.tonnageHalfYear')),
      lineChart(monthlyTonnage(workouts, shown.year, shown.month, 6).map((point) => ({ ...point, value: toWeight(point.value) })), weightUnit(), t('stats.tonnageByMonth'), (date) => {
        const [year, month] = date.split('-').map(Number);
        return formatMonth(year, month - 1);
      }),
      h('h2', {}, t('stats.totals')),
      ...(['week', 'month', 'year'] as const).map((period) =>
        h(
          'p',
          { className: 'set-row' },
          t(`period.${period}`),
          h(
            'span',
            {},
            t('stats.totalRow', {
              workouts: totals[period].workouts,
              hours: formatDuration(totals[period].durationMin),
              tonnage: formatWeight(totals[period].tonnage),
            }),
          ),
        ),
      ),
      h('h2', {}, t('stats.top')),
      ...topRows,
      h('h2', {}, t('stats.overdue')),
      ...(overdueRows.length > 0 ? overdueRows : [h('p', { className: 'hint' }, t('stats.noOverdue'))]),
    );
  }

  show();
}
