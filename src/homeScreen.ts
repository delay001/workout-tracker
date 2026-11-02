import { renderBackupScreen } from './backupScreen';
import { todayLocal } from './dates';
import type { WorkoutType } from './db';
import { field, h } from './dom';
import { startWorkout, WORKOUT_TYPE_NAMES } from './workouts';

export function renderHomeScreen(
  root: HTMLElement,
  message: string,
  onStarted: () => void,
  onHistory: () => void,
): void {
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

  const backup = h('section');

  root.replaceChildren(
    h('h1', {}, 'Трекер тренировок'),
    h('p', { className: 'status', role: 'status' }, message),
    h('h2', {}, 'Новая тренировка'),
    field('Дата', dateInput),
    h('div', { className: 'type-buttons' }, ...typeButtons),
    h('button', { type: 'button', className: 'button button-secondary', onclick: onHistory }, 'История'),
    backup,
  );
  renderBackupScreen(backup);
}
