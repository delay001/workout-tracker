import { renderBackupScreen } from './backupScreen';
import { field, h } from './dom';
import { renderExerciseSettings } from './exerciseSettingsScreen';
import { renderImportScreen } from './importScreen';
import { applyTheme, getSetting, setSetting, type Theme } from './settings';
import { renderTemplateSettings } from './templateSettingsScreen';
import { addWorkoutType, deleteWorkoutType, getCustomWorkoutTypes } from './workouts';

export async function renderSettingsScreen(
  root: HTMLElement,
  message: string,
  onImported: (message: string) => void,
): Promise<void> {
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
    const backup = h('section');
    const name = h('input', {
      type: 'text',
      autocomplete: 'off',
      value: await getSetting('name'),
      onchange: () => void setSetting('name', name.value.trim()),
    });
    const theme = document.documentElement.dataset.theme;

    const themeChip = (label: string, value: Theme): HTMLElement =>
      h(
        'label',
        { className: 'chip' },
        h('input', {
          type: 'radio',
          name: 'theme',
          checked: theme === value,
          onchange: () => {
            applyTheme(value);
            void setSetting('theme', value);
          },
        }),
        label,
      );

    root.replaceChildren(
      h('h1', {}, 'Настройки'),
      h('p', { className: 'status', role: 'status' }, message),
      field('Твоё имя', name),
      h(
        'div',
        { className: 'field' },
        h('span', {}, 'Тема'),
        h(
          'div',
          { className: 'chips', role: 'radiogroup', ariaLabel: 'Тема' },
          themeChip('Тёмная', 'dark'),
          themeChip('Светлая', 'light'),
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: () => void renderExerciseSettings(root, () => void showMain()),
        },
        'Упражнения',
      ),
      h(
        'button',
        { type: 'button', className: 'button button-secondary', onclick: () => void showTypes() },
        'Типы тренировок',
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: () => void renderTemplateSettings(root, () => void showMain()),
        },
        'Шаблоны',
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: () => void renderImportScreen(root, () => void showMain()),
        },
        'Старые записи',
      ),
      backup,
    );
    renderBackupScreen(backup, onImported);
  }

  await showMain();
}
