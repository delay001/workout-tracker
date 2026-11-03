import { formatDate, todayLocal } from './dates';
import type { Workout } from './db';
import { dateField, field, h } from './dom';
import { pageHeader } from './avatar';
import { getMonthlyGoal, getSetting } from './settings';
import { goalRing, progressRing, renderTotalsScreen } from './statsScreen';
import { getBodyWeights, getWeightGoal, goalStatus, movingAverage } from './bodyWeight';
import { formatWeight } from './units';
import { weekStreak } from './achievements';
import { getFinishedWorkouts, getWorkoutTypes, startFromTemplate, workoutTypeName } from './workouts';
import { t } from './i18n';

export async function renderHomeScreen(
  root: HTMLElement,
  active: Workout | undefined,
  onOpenActive: () => void,
  onOpenStats: () => void,
  onOpenSettings: () => void,
): Promise<void> {
  async function showStart(): Promise<void> {
    const dateInput = h('input', { type: 'date', value: todayLocal() });

    const typeButtons = (await getWorkoutTypes()).map((type) =>
      h(
        'button',
        {
          type: 'button',
          className: 'button',
          onclick: async () => {
            await startFromTemplate(dateInput.value || todayLocal(), type);
            onOpenActive();
          },
        },
        workoutTypeName(type),
      ),
    );

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, t('home.newWorkout')),
        h(
          'div',
          { className: 'centered' },
          field(t('common.date'), dateField(dateInput)),
          h('div', { className: 'type-buttons' }, ...typeButtons),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'button button-secondary bottom-action',
            onclick: () => void showMain(),
          },
          t('common.back'),
        ),
      ),
    );
  }

  // Цель месяца, а рядом цель по весу, если она поставлена
  async function goals(): Promise<HTMLElement> {
    const workouts = await getFinishedWorkouts();
    const today = todayLocal();
    const monthCount = workouts.filter((workout) => workout.date.startsWith(today.slice(0, 7))).length;
    const month = goalRing(monthCount, await getMonthlyGoal(), weekStreak(workouts, today));
    const weightGoal = await getWeightGoal();
    if (!weightGoal) {
      return month;
    }
    const trend = movingAverage(await getBodyWeights());
    const status = goalStatus(weightGoal, trend, today);
    const reached = status.percent >= 100;
    const weight = h(
      'div',
      { className: 'goal' },
      progressRing(status.percent, `${status.percent}%`, t('home.weightGoal')),
      h(
        'div',
        {},
        h('p', { className: 'goal-title' }, t('home.weightGoal')),
        h(
          'p',
          { className: 'hint' },
          reached
            ? t('stats.goalDone')
            : t('home.weightGoalLeft', { weight: formatWeight(Math.abs(status.leftKg)), days: status.leftDays }),
        ),
      ),
    );
    return h('div', { className: 'goals' }, month, weight);
  }

  async function showMain(): Promise<void> {
    const name = await getSetting('name');
    const workouts = await getFinishedWorkouts();
    const month = todayLocal().slice(0, 7);
    const monthCount = workouts.filter((workout) => workout.date.startsWith(month)).length;

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        await pageHeader(name ? t('home.helloName', { name }) : t('home.hello'), onOpenSettings),
        h(
          'div',
          { className: 'centered' },
          active
            ? h(
                'button',
                { type: 'button', className: 'button button-big', onclick: onOpenActive },
                t('home.activeWorkout'),
                h(
                  'span',
                  { className: 'button-note' },
                  `${workoutTypeName(active.type)}, ${formatDate(active.date)}`,
                ),
              )
            : h(
                'button',
                { type: 'button', className: 'button button-big', onclick: () => void showStart() },
                t('home.newEntry'),
              ),
          h(
            'div',
            { className: 'stats' },
            h('button', { type: 'button', className: 'stat', onclick: onOpenStats }, h('strong', {}, String(monthCount)), t('home.thisMonth', { count: monthCount })),
            h('button', { type: 'button', className: 'stat', onclick: () => void renderTotalsScreen(root, () => void showMain()) }, h('strong', {}, String(workouts.length)), t('home.totalWorkouts', { count: workouts.length })),
          ),
          await goals(),
        ),
      ),
    );
  }

  await showMain();
}
