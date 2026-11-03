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
  type Accent,
  type Theme,
} from './settings';
import { numberInput, select } from './ui';
import { getUnits, setUnits } from './units';
import { resizeAvatar } from './avatar';
import { MUSCLES } from './muscles';
import { getNorms } from './volumeScreen';
import { renderTemplateSettings } from './templateSettingsScreen';
import { addWorkoutType, deleteWorkoutType, getCustomWorkoutTypes, workoutTypeName } from './workouts';
import { LANGUAGE, setLanguage, t, type Language } from './i18n';
import { renderOnboarding } from './onboarding';

// В стандартном списке нельзя нарисовать кружок, поэтому цвет показывает эмодзи
const ACCENT_DOTS: Record<Accent, string> = {
  pink: '🩷',
  orange: '🟠',
  green: '🟢',
  blue: '🔵',
  violet: '🟣',
  red: '🔴',
};

export async function renderSettingsScreen(
  root: HTMLElement,
  message: string,
  onImported: (message: string) => void,
): Promise<void> {
  async function showNorms(): Promise<void> {
    const norms = await getNorms();
    const inputs = MUSCLES.map((muscle) => {
      const min = numberInput('integer', String(norms[muscle][0]), 2);
      const max = numberInput('integer', String(norms[muscle][1]), 2);
      return [muscle, min, max] as const;
    });
    const save = (): void => {
      const value = Object.fromEntries(
        inputs.map(([muscle, min, max]) => [muscle, [Number(min.value), Number(max.value)]]),
      );
      void setSetting('volumeNorms', JSON.stringify(value));
    };
    inputs.forEach(([, min, max]) => {
      min.onchange = save;
      max.onchange = save;
    });
    const ratio = numberInput('decimal', (await getSetting('balanceRatio')) || '3', 3);
    ratio.onchange = () => void setSetting('balanceRatio', ratio.value);

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, t('settings.norms')),
        h('p', { className: 'hint' }, t('settings.normsHint')),
        ...inputs.map(([muscle, min, max]) =>
          h('div', { className: 'set-inputs' }, field(t(`muscle.${muscle}`), min), field('—', max)),
        ),
        field(t('settings.balanceRatio'), ratio),
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
      ACCENTS.map((value): [string, string] => [value, `${ACCENT_DOTS[value]} ${t(`accent.${value}`)}`]),
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

    const link = (label: string, onclick: () => void): HTMLButtonElement =>
      h('button', { type: 'button', className: 'button button-secondary', onclick }, label);

    root.replaceChildren(
      h('h1', {}, t('tab.settings')),
      h('p', { className: 'status', role: 'status' }, message),

      h('h2', {}, t('settings.profile')),
      h(
        'div',
        { className: 'avatar-row' },
        ...(avatar ? [h('img', { className: 'avatar', src: avatar, alt: t('settings.avatar') })] : []),
        link(t('settings.avatarChoose'), () => avatarFile.click()),
        ...(avatar
          ? [
              link(t('settings.avatarRemove'), () => {
                void setSetting('avatar', '').then(showMain);
              }),
            ]
          : []),
      ),
      avatarFile,
      avatarError,
      field(t('settings.yourName'), name),
      field(t('settings.height'), height),
      field(t('settings.sex'), sex),

      h('h2', {}, t('settings.groupLook')),
      field(
        t('settings.language'),
        select(
          [
            ['ru', 'Русский'],
            ['en', 'English'],
          ],
          LANGUAGE,
          (value) => setLanguage(value as Language),
        ),
      ),
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
      field(t('settings.units'), units),

      h('h2', {}, t('settings.groupTraining')),
      field(t('settings.goal'), goal),
      field(t('settings.weightStep'), weightStep),
      field(t('settings.overdueDays'), overdueDays),
      link(t('common.exercises'), () => void renderExerciseSettings(root, () => void showMain())),
      link(t('settings.workoutTypes'), () => void showTypes()),
      link(t('settings.templates'), () => void renderTemplateSettings(root, () => void showMain())),
      link(t('settings.norms'), () => void showNorms()),

      h('h2', {}, t('settings.groupData')),
      link(t('import.title'), () => void renderImportScreen(root, () => void showMain())),
      backup,
      link(t('settings.onboarding'), () => void renderOnboarding(root, () => void showMain())),
    );
    renderBackupScreen(backup, onImported);
  }

  await showMain();
}
