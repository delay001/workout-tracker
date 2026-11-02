import { formatDate, todayLocal } from './dates';
import type { Workout } from './db';
import { field, h } from './dom';
import { getWorkoutTypes, startWorkout, workoutTypeName } from './workouts';

export function renderHomeScreen(
  root: HTMLElement,
  active: Workout | undefined,
  onOpenActive: () => void,
): void {
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
          { type: 'button', className: 'button button-secondary bottom-action', onclick: showMain },
          'Назад',
        ),
      ),
    );
  }

  function showMain(): void {
    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, 'Тренировка'),
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
        ),
      ),
    );
  }

  showMain();
}
