import { renderBackupScreen } from './backupScreen';
import { field, h } from './dom';
import { renderExerciseSettings } from './exerciseSettingsScreen';
import { addWorkoutType, deleteWorkoutType, getCustomWorkoutTypes } from './workouts';

export function renderSettingsScreen(
  root: HTMLElement,
  message: string,
  onImported: (message: string) => void,
): void {
  async function showTypes(): Promise<void> {
    const name = h('input', { type: 'text', autocomplete: 'off' });
    const error = h('p', { className: 'error', role: 'alert' });

    async function run(action: () => Promise<void>): Promise<void> {
      try {
        await action();
        await showTypes();
      } catch (problem) {
        error.textContent = problem instanceof Error ? problem.message : 'Не получилось';
      }
    }

    const rows = (await getCustomWorkoutTypes()).map((type) =>
      h(
        'li',
        { className: 'set-row' },
        type,
        h(
          'button',
          {
            type: 'button',
            className: 'remove-button',
            ariaLabel: `Удалить тип ${type}`,
            onclick: () => void run(() => deleteWorkoutType(type)),
          },
          '✕',
        ),
      ),
    );

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, 'Типы тренировок'),
        h('p', { className: 'hint' }, 'Верх, Низ и Другое есть всегда. Здесь можно добавить свои.'),
        h('ol', { className: 'set-list' }, ...rows),
        h(
          'form',
          {
            onsubmit: (event: Event) => {
              event.preventDefault();
              void run(() => addWorkoutType(name.value));
            },
          },
          field('Новый тип', name),
          error,
          h('button', { type: 'submit', className: 'button' }, 'Добавить'),
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
    const backup = h('section');

    root.replaceChildren(
      h('h1', {}, 'Настройки'),
      h('p', { className: 'status', role: 'status' }, message),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: () => void renderExerciseSettings(root, showMain),
        },
        'Упражнения',
      ),
      h(
        'button',
        { type: 'button', className: 'button button-secondary', onclick: () => void showTypes() },
        'Типы тренировок',
      ),
      backup,
    );
    renderBackupScreen(backup, onImported);
  }

  showMain();
}
