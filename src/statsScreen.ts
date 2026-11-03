import { pageHeader } from './avatar';
import { barChart, lineChart } from './chart';
import { formatDate, formatDuration, formatMonth, formatMonthRange, shiftMonth, todayLocal } from './dates';
import { db } from './db';
import { collapsible, emptyState, h } from './dom';
import { renderCalcScreen } from './calcScreen';
import { currentStates, renderAchievementsScreen, renderYearScreen } from './motivationScreens';
import { overdueExercises, topExercises, workoutStats } from './progress';
import { formatWeight, toWeight, weightUnit } from './units';
import { getMonthlyGoal, getOverdueDays } from './settings';
import { averageRating, goalPercent, monthlyTonnage, monthStats, sortTypes, tonnage, workoutCounts } from './stats';
import { radioChips, segmented } from './ui';
import { renderVolumeView } from './volumeScreen';
import { getFinishedWorkouts, workoutTypeName } from './workouts';
import { LOCALE, t } from './i18n';

const now = new Date();
let shown = { year: now.getFullYear(), month: now.getMonth() };
// Сколько месяцев показывает статистика: последний из них — shown
let shownMonths: 1 | 3 | 6 | 12 = 1;

// Кольцо прогресса к цели месяца. Справа подпись и, если передана, серия недель.
// Кольцо прогресса: доля от 0 до 100 и подпись в центре
export function progressRing(percent: number, center: string, label: string): HTMLElement {
  const radius = 40;
  const length = 2 * Math.PI * radius;
  const ring = h('div', {
    className: 'goal-ring',
    role: 'progressbar',
    ariaValueNow: String(percent),
    ariaValueMax: '100',
    ariaLabel: label,
  });
  ring.insertAdjacentHTML(
    'beforeend',
    `<svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="goal-ring-track" cx="50" cy="50" r="${radius}"/>
      <circle class="goal-ring-fill" cx="50" cy="50" r="${radius}"
        stroke-dasharray="${length}" style="--ring-offset: ${length * (1 - percent / 100)}; --ring-length: ${length}"/>
    </svg>`,
  );
  ring.append(h('strong', {}, center));
  return ring;
}

export function goalRing(count: number, goal: number, streak?: number): HTMLElement {
  const ring = progressRing(goalPercent(count, goal), t('stats.goalRingValue', { count, goal }), t('stats.goalLabel'));

  const left = Math.max(0, goal - count);
  return h(
    'div',
    { className: 'goal' },
    ring,
    h(
      'div',
      {},
      h('p', { className: 'goal-title' }, t('stats.goalLabel')),
      h('p', { className: 'hint' }, left > 0 ? t('stats.goalLeft', { count: left }) : t('stats.goalDone')),
      ...(streak ? [h('p', { className: 'goal-streak' }, t('stats.streak', { count: streak }))] : []),
    ),
  );
}

// Сводка за все время, открывается с главного экрана
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

export async function renderStatsScreen(root: HTMLElement, onOpenSettings: () => void): Promise<void> {
  const body = h('div');
  const showView = async (): Promise<void> => {
    if (shownView === 'month') {
      await renderMonthView(body, root, onOpenSettings);
    } else {
      await renderVolumeView(body);
    }
  };
  root.replaceChildren(
    await pageHeader(t('tab.stats'), onOpenSettings),
    segmented(radioChips<'month' | 'week'>(
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
    )),
    body,
  );
  await showView();
}

// Расчеты, ачивки и итоги открываются на всю вкладку, а не под шапкой статистики
async function renderMonthView(root: HTMLElement, page: HTMLElement, onOpenSettings: () => void): Promise<void> {
  const back = (): void => void renderStatsScreen(page, onOpenSettings);
  const workouts = await getFinishedWorkouts();
  const goal = await getMonthlyGoal();
  const achievements = await currentStates();
  const earnedAchievements = achievements.filter((state) => state.count > 0).length;
  const today = todayLocal();
  const top = topExercises(workouts, Infinity);
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
    const months = shownMonths;
    const stats = monthStats(workouts, shown.year, shown.month, months);
    const start = shiftMonth(shown.year, shown.month, 1 - months);
    const from = `${start.year}-${String(start.month + 1).padStart(2, '0')}`;
    const to = `${shown.year}-${String(shown.month + 1).padStart(2, '0')}`;
    const periodWorkouts = workouts.filter(
      (workout) => workout.date.slice(0, 7) >= from && workout.date.slice(0, 7) <= to,
    );
    const rating = averageRating(periodWorkouts);
    const monthPoints = [...periodWorkouts].reverse().map((workout) => ({
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
            shown = shiftMonth(shown.year, shown.month, delta * months);
            show();
          },
        },
        label,
      );

    const tile = (value: string, label: string): HTMLElement =>
      h('div', { className: 'stat' }, h('strong', {}, value), label);

    const periods = segmented(radioChips<string>(
      'stats-period',
      t('stats.period'),
      [
        ['1', t('period.month')],
        ['3', t('period.3m')],
        ['6', t('period.6m')],
        ['12', t('period.1y')],
      ],
      String(months),
      (value) => {
        shownMonths = Number(value) as typeof shownMonths;
        show();
      },
    ));

    const tonnageTitle = {
      1: 'stats.tonnageMonth',
      3: 'stats.tonnage3m',
      6: 'stats.tonnageHalfYear',
      12: 'stats.tonnageYear',
    } as const;
    // До 3 месяцев столбец — неделя, дальше — месяц
    const byWeek = months <= 3;
    const monthEnd = `${to}-${String(new Date(shown.year, shown.month + 1, 0).getDate()).padStart(2, '0')}`;
    // Будущие недели не показываются: последний столбец — текущая неделя
    const periodEnd = monthEnd < today ? monthEnd : today;
    const countBars = workoutCounts(periodWorkouts, `${from}-01`, periodEnd, byWeek ? 'week' : 'month').map(
      (bucket) => {
        const [year, month, day] = bucket.start.split('-').map(Number);
        const when = byWeek
          ? `${formatDate(bucket.start).slice(0, 5)} – ${formatDate(bucket.end).slice(0, 5)}`
          : formatMonth(year, month - 1);
        return {
          value: bucket.count,
          label: byWeek ? `${String(day).padStart(2, '0')}.${String(month).padStart(2, '0')}` : formatMonth(year, month - 1).slice(0, 3),
          readout: t('stats.countReadout', { count: bucket.count, when }),
        };
      },
    );

    const formatChartMonth = (date: string): string => {
      const [year, month] = date.split('-').map(Number);
      return formatMonth(year, month - 1);
    };

    root.replaceChildren(
      periods,
      h(
        'div',
        { className: 'month-nav' },
        monthButton('‹', t('common.prevMonth'), -1),
        h('h2', {}, formatMonthRange(shown.year, shown.month, months)),
        monthButton('›', t('common.nextMonth'), 1),
      ),
      ...(months === 1 ? [goalRing(stats.count, goal)] : []),
      h(
        'div',
        { className: 'stats' },
        tile(String(stats.count), t('stats.workouts', { count: stats.count })),
        tile(toWeight(stats.tonnage).toLocaleString(LOCALE), t('stats.tonnage', { unit: weightUnit() })),
        tile(String(stats.sets), t('stats.workingSets', { count: stats.sets })),
        tile(formatDuration(stats.durationMin), t('stats.hours')),
        tile(rating === undefined ? '—' : String(rating), t('stats.averageRating')),
        h(
          'button',
          { type: 'button', className: 'stat', onclick: () => void renderAchievementsScreen(page, back) },
          h('strong', {}, t('achievement.tileValue', { earned: earnedAchievements, total: achievements.length })),
          t('achievement.tileLabel'),
        ),
        h(
          'button',
          { type: 'button', className: 'stat', onclick: () => void renderYearScreen(page, back) },
          t('year.title'),
        ),
        h(
          'button',
          { type: 'button', className: 'stat', onclick: () => void renderCalcScreen(page, back) },
          t('stats.calc'),
        ),
      ),
      ...(stats.count === 0
        ? [emptyState('📊', t('stats.noWorkouts'))]
        : [
            h('h2', {}, t(byWeek ? 'stats.countByWeek' : 'stats.countByMonth')),
            barChart(countBars, t(byWeek ? 'stats.countByWeek' : 'stats.countByMonth')),
            h('h2', {}, t('stats.byType')),
            ...sortTypes(stats.byType).map(([type, count]) =>
              h('p', { className: 'set-row' }, workoutTypeName(type), h('strong', {}, String(count))),
            ),
            h('h2', {}, t(tonnageTitle[months])),
          ]),
      ...(monthPoints.length === 0
        ? []
        : months === 1
          ? [lineChart(monthPoints, weightUnit(), t('stats.tonnageMonth'))]
          : [
              lineChart(
                monthlyTonnage(workouts, shown.year, shown.month, months).map((point) => ({
                  ...point,
                  value: toWeight(point.value),
                })),
                weightUnit(),
                t('stats.tonnageByMonth'),
                formatChartMonth,
              ),
            ]),
      h('h2', {}, t('stats.top')),
      ...collapsible(topRows),
      h('h2', {}, t('stats.overdue')),
      ...(overdueRows.length > 0 ? collapsible(overdueRows) : [h('p', { className: 'hint' }, t('stats.noOverdue'))]),
    );
  }

  show();
}
