import { todayLocal } from './dates';
import type { WorkoutType } from './db';
import { field, h } from './dom';
import { startWorkout, WORKOUT_TYPE_NAMES } from './workouts';

export function renderHomeScreen(root: HTMLElement, message: string, onStarted: () => void): void {
  function showStart(): void {
    const dateInput = h('input', { type: 'date', value: todayLocal() });

    const typeButtons = (Object.keys(WORKOUT_TYPE_NAMES) as WorkoutType[]).map((type) =>
      h(
        'button',
        {
          type: 'button',
          className: 'button',
          onclick: async () => {
            await startWorkout(dateInput.value || todayLocal(), type);
            onStarted();
          },
        },
        WORKOUT_TYPE_NAMES[type],
      ),
    );

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, 'Новая тренировка'),
        field('Дата', dateInput),
        h('div', { className: 'type-buttons' }, ...typeButtons),
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
      h('h1', {}, 'Тренировка'),
      h('p', { className: 'status', role: 'status' }, message),
      h('button', { type: 'button', className: 'button button-big', onclick: showStart }, '+ Тренировка'),
    );
  }

  showMain();
}
