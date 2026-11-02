import { renderBackupScreen } from './backupScreen';
import { field, h } from './dom';
import { renderExerciseSettings } from './exerciseSettingsScreen';
import { renderImportScreen } from './importScreen';
import {
  ACCENTS,
  applyAccent,
  applyTheme,
  getMonthlyGoal,
  getOverdueDays,
  getSetting,
  getWeightStep,
  parseAccent,
  parseTheme,
  setSetting,
  type Theme,
} from './settings';
import { numberInput, select } from './ui';
import { getUnits, setUnits } from './units';
import { resizeAvatar } from './avatar';
import { renderTemplateSettings } from './templateSettingsScreen';
import { addWorkoutType, deleteWorkoutType, getCustomWorkoutTypes, workoutTypeName } from './workouts';
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

    const builtInRows = ['upper', 'lower', 'other'].map((type) =>
      h(
        'li',
        { className: 'set-row' },
        workoutTypeName(type),
        h('span', { className: 'hint-inline' }, t('settings.builtInType')),
      ),
    );

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
        h('ol', { className: 'set-list' }, ...builtInRows, ...rows),
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
    const goal = numberInput('integer', String(await getMonthlyGoal()), 2);
    goal.onchange = () => void setSetting('monthlyGoal', goal.value);
    const overdueDays = numberInput('integer', String(await getOverdueDays()), 3);
    overdueDays.onchange = () => void setSetting('overdueDays', overdueDays.value);
    const height = numberInput('integer', await getSetting('heightCm'), 3);
    height.onchange = () => void setSetting('heightCm', height.value);
    const sex = select(
      [
        ['male', t('settings.sexMale')],
        ['female', t('settings.sexFemale')],
      ],
      (await getSetting('sex')) || 'male',
      (value) => void setSetting('sex', value),
    );
    const weightStep = select(
      ['0.5', '1', '2.5', '5', '10'].map((step): [string, string] => [step, step]),
      String(await getWeightStep()),
      (value) => void setSetting('weightStep', value),
    );
    const units = select(
      [
        ['metric', t('settings.unitsMetric')],
        ['imperial', t('settings.unitsImperial')],
      ],
      getUnits(),
      (value) => {
        setUnits(value);
        void setSetting('units', value);
      },
    );
    const avatarFile = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const avatarError = h('p', { className: 'error', role: 'alert' });
    avatarFile.onchange = async () => {
      const file = avatarFile.files?.[0];
      if (file) {
        try {
          await setSetting('avatar', await resizeAvatar(file));
          await showMain();
        } catch {
          avatarError.textContent = t('settings.avatarFailed');
        }
      }
    };
    const avatar = await getSetting('avatar');
    const theme = parseTheme(await getSetting('theme'));
    const accent = parseAccent(await getSetting('accent'));

    const accentSelect = select(
      ACCENTS.map((value): [string, string] => [value, t(`accent.${value}`)]),
      accent,
      (value) => {
        applyAccent(parseAccent(value));
        void setSetting('accent', value);
      },
    );

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
      field(t('settings.overdueDays'), overdueDays),
      h(
        'div',
        { className: 'field' },
        h('span', {}, t('settings.theme')),
        h(
          'div',
          { className: 'chips', role: 'radiogroup', ariaLabel: t('settings.theme') },
          themeChip(t('settings.themeDark'), 'dark'),
          themeChip(t('settings.themeLight'), 'light'),
          themeChip(t('settings.themeSystem'), 'system'),
        ),
      ),
      field(t('settings.accent'), accentSelect),
      field(t('settings.weightStep'), weightStep),
      field(t('settings.units'), units),
      h('h2', {}, t('settings.profile')),
      field(t('settings.height'), height),
      field(t('settings.sex'), sex),
      h(
        'div',
        { className: 'avatar-row' },
        ...(avatar ? [h('img', { className: 'avatar', src: avatar, alt: t('settings.avatar') })] : []),
        h(
          'button',
          { type: 'button', className: 'button button-secondary', onclick: () => avatarFile.click() },
          t('settings.avatarChoose'),
        ),
        ...(avatar
          ? [
              h(
                'button',
                {
                  type: 'button',
                  className: 'button button-secondary',
                  onclick: async () => {
                    await setSetting('avatar', '');
                    await showMain();
                  },
                },
                t('settings.avatarRemove'),
              ),
            ]
          : []),
      ),
      avatarFile,
      avatarError,
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
