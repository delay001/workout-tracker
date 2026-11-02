import { renderBackupScreen } from './backupScreen';
import { field, h } from './dom';
import { renderExerciseSettings } from './exerciseSettingsScreen';
import { renderImportScreen } from './importScreen';
import { applyTheme, getMonthlyGoal, getSetting, setSetting, type Theme } from './settings';
import { renderTemplateSettings } from './templateSettingsScreen';
import { addWorkoutType, deleteWorkoutType, getCustomWorkoutTypes } from './workouts';
import { t } from './i18n';

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
        error.textContent = problem instanceof Error ? problem.message : t('common.failed');
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
            ariaLabel: t('settings.deleteType', { type }),
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
        h('h1', {}, t('settings.workoutTypes')),
        h('p', { className: 'hint' }, t('settings.typesHint')),
        h('ol', { className: 'set-list' }, ...rows),
        h(
          'form',
          {
            onsubmit: (event: Event) => {
              event.preventDefault();
              void run(() => addWorkoutType(name.value));
            },
          },
          field(t('settings.newType'), name),
          error,
          h('button', { type: 'submit', className: 'button' }, t('common.add')),
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

  async function showMain(): Promise<void> {
    const backup = h('section');
    const name = h('input', {
      type: 'text',
      autocomplete: 'off',
      value: await getSetting('name'),
      onchange: () => void setSetting('name', name.value.trim()),
    });
    const goal = h('input', {
      type: 'text',
      inputMode: 'numeric',
      autocomplete: 'off',
      maxLength: 2,
      value: String(await getMonthlyGoal()),
      onchange: () => void setSetting('monthlyGoal', goal.value.trim()),
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
      h('h1', {}, t('tab.settings')),
      h('p', { className: 'status', role: 'status' }, message),
      field(t('settings.yourName'), name),
      field(t('settings.goal'), goal),
      h(
        'div',
        { className: 'field' },
        h('span', {}, t('settings.theme')),
        h(
          'div',
          { className: 'chips', role: 'radiogroup', ariaLabel: t('settings.theme') },
          themeChip(t('settings.themeDark'), 'dark'),
          themeChip(t('settings.themeLight'), 'light'),
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: () => void renderExerciseSettings(root, () => void showMain()),
        },
        t('common.exercises'),
      ),
      h(
        'button',
        { type: 'button', className: 'button button-secondary', onclick: () => void showTypes() },
        t('settings.workoutTypes'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: () => void renderTemplateSettings(root, () => void showMain()),
        },
        t('settings.templates'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: () => void renderImportScreen(root, () => void showMain()),
        },
        t('import.title'),
      ),
      backup,
    );
    renderBackupScreen(backup, onImported);
  }

  await showMain();
}
