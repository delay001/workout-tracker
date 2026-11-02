import { formatDate, todayLocal } from './dates';
import type { Workout } from './db';
import { field, h } from './dom';
import { getSetting } from './settings';
import { getFinishedWorkouts, getWorkoutTypes, startWorkout, workoutTypeName } from './workouts';

export async function renderHomeScreen(
  root: HTMLElement,
  active: Workout | undefined,
  onOpenActive: () => void,
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
            await startWorkout(dateInput.value || todayLocal(), type);
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
        h('h1', {}, 'Новая тренировка'),
        h(
          'div',
          { className: 'centered' },
          field('Дата', dateInput),
          h('div', { className: 'type-buttons' }, ...typeButtons),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'button button-secondary bottom-action',
            onclick: () => void showMain(),
          },
          'Назад',
        ),
      ),
    );
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
        h('h1', {}, name ? `Привет, ${name}!` : 'Привет!'),
        h(
          'div',
          { className: 'centered' },
          active
            ? h(
                'button',
                { type: 'button', className: 'button button-big', onclick: onOpenActive },
                'Активная тренировка',
                h(
                  'span',
                  { className: 'button-note' },
                  `${workoutTypeName(active.type)}, ${formatDate(active.date)}`,
                ),
              )
            : h(
                'button',
                { type: 'button', className: 'button button-big', onclick: () => void showStart() },
                'Новая запись',
              ),
          h(
            'div',
            { className: 'stats' },
            h('div', { className: 'stat' }, h('strong', {}, String(monthCount)), 'за этот месяц'),
            h('div', { className: 'stat' }, h('strong', {}, String(workouts.length)), 'всего тренировок'),
          ),
        ),
      ),
    );
  }

  await showMain();
}
