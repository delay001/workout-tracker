import { todayLocal } from './dates';
import { field, h } from './dom';
import { getWorkoutTypes, startWorkout, workoutTypeName } from './workouts';

export function renderHomeScreen(root: HTMLElement, message: string, onStarted: () => void): void {
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
            onStarted();
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
      h(
        'button',
        { type: 'button', className: 'button button-big', onclick: () => void showStart() },
        '+ Тренировка',
      ),
    );
  }

  showMain();
}
