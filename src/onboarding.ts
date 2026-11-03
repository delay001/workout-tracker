import { BODY_KG_MAX, BODY_KG_MIN, getBodyWeights, saveBodyWeight, saveWeightGoal } from './bodyWeight';
import { todayLocal } from './dates';
import { db } from './db';
import { dateField, field, h } from './dom';
import { LANGUAGE, setLanguage, t, type Language } from './i18n';
import {
  applyTheme,
  getSetting,
  parseTheme,
  setSetting,
} from './settings';
import { bodyWeightInput, numberInput, select } from './ui';
import { fromWeight, weightUnit } from './units';

// Знакомство нужно только совсем новому пользователю, текущие данные его не вызывают
export async function needsOnboarding(): Promise<boolean> {
  return !(await getSetting('onboarded')) && (await db.workouts.count()) === 0;
}

// Проверка полей прямо при вводе: красная подсказка про первое неверное поле.
// Необязательное поле можно оставить пустым, обязательное — нет (это проверяется при нажатии «Дальше»).
type Rule = [HTMLInputElement, (input: HTMLInputElement) => boolean, string, boolean?];

function checker(error: HTMLElement, rules: Rule[], requiredMessage = ''): (submitting?: boolean) => boolean {
  const check = (submitting = false): boolean => {
    const broken = rules.find(([input, valid, , required]) =>
      input.value.trim() === '' ? submitting && required : !valid(input),
    );
    error.textContent = broken ? (broken[0].value.trim() === '' ? requiredMessage : broken[2]) : '';
    return !broken;
  };
  for (const [input] of rules) input.addEventListener('input', () => check());
  return check;
}

export async function renderOnboarding(root: HTMLElement, onDone: () => void): Promise<void> {
  async function finish(): Promise<void> {
    await setSetting('onboarded', 'yes');
    onDone();
  }

  function layout(title: string, step: number, controls: HTMLElement[], next: () => Promise<void>): void {
    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, title),
        h('p', { className: 'hint' }, `${step} / 4`),
        ...controls,
        h(
          'div',
          { className: 'centered' },
          h(
            'button',
            { type: 'button', className: 'button', onclick: () => void next() },
            step === 4 ? t('onboarding.done') : t('onboarding.next'),
          ),
          h(
            'button',
            { type: 'button', className: 'button button-secondary', onclick: () => void finish() },
            t('onboarding.skip'),
          ),
        ),
      ),
    );
  }

  async function languageStep(): Promise<void> {
    const language = select(
      [
        ['ru', 'Русский'],
        ['en', 'English'],
      ],
      LANGUAGE,
      (value) => setLanguage(value as Language),
    );
    const theme = select(
      [
        ['dark', t('settings.themeDark')],
        ['light', t('settings.themeLight')],
        ['system', t('settings.themeSystem')],
      ],
      parseTheme(await getSetting('theme')),
      (value) => {
        applyTheme(parseTheme(value));
        void setSetting('theme', value);
      },
    );
    const name = h('input', { type: 'text', autocomplete: 'given-name', maxLength: 30, value: await getSetting('name') });
    // Имя — только буквы, пробел, дефис и апостроф: цифры и знаки убираются прямо при вводе
    name.oninput = () => {
      name.value = name.value.replace(/[^\p{L}\s'-]/gu, '');
    };
    const nameError = h('p', { className: 'error', role: 'alert' });
    const check = checker(nameError, [[name, () => true, '', true]], t('onboarding.needName'));
    // Имя сохраняется сразу, чтобы не потерять его, если дальше нажать «Пропустить»
    name.onchange = () => void setSetting('name', name.value.trim());

    layout(
      t('onboarding.step1'),
      1,
      [
        h(
          'section',
          { className: 'intro' },
          h('p', {}, t('onboarding.intro')),
          h(
            'ul',
            {},
            ...(['onboarding.feature1', 'onboarding.feature2', 'onboarding.feature3', 'onboarding.feature4'] as const).map(
              (key) => h('li', {}, t(key)),
            ),
          ),
        ),
        field(t('settings.language'), language),
        field(t('onboarding.name'), name),
        field(t('settings.theme'), theme),
        nameError,
      ],
      async () => {
        if (!check(true)) return;
        await setSetting('name', name.value.trim());
        await goalStep();
      },
    );
  }

  async function goalStep(): Promise<void> {
    const type = select(
      [
        ['mass', t('onboarding.goalMass')],
        ['cut', t('onboarding.goalCut')],
        ['strength', t('onboarding.goalStrength')],
        ['maintain', t('onboarding.goalMaintain')],
      ],
      (await getSetting('goalType')) || 'mass',
      () => undefined,
    );
    const weight = bodyWeightInput();
    const target = bodyWeightInput();
    const deadline = h('input', { type: 'date' });
    const height = numberInput('integer', await getSetting('heightCm'), 3);
    const age = numberInput('integer', await getSetting('age'), 3);
    const error = h('p', { className: 'error', role: 'alert' });
    const kg = (input: HTMLInputElement): number => fromWeight(Number(input.value));
    const check = checker(error, [
      [weight, (input) => kg(input) >= BODY_KG_MIN && kg(input) <= BODY_KG_MAX, t('onboarding.badWeight'), true],
      [height, (input) => Number(input.value) >= 100 && Number(input.value) <= 250, t('onboarding.badHeight'), true],
      [age, (input) => Number(input.value) >= 14 && Number(input.value) <= 100, t('onboarding.badAge'), true],
      [target, (input) => kg(input) >= BODY_KG_MIN && kg(input) <= BODY_KG_MAX, t('onboarding.badTarget')],
    ], t('onboarding.needBody'));

    layout(
      t('onboarding.step2'),
      2,
      [
        field(t('onboarding.goalType'), type),
        field(t('onboarding.currentWeight', { unit: weightUnit() }), weight),
        field(t('settings.height'), height),
        field(t('onboarding.age'), age),
        field(t('goal.target', { unit: weightUnit() }), target),
        field(t('goal.deadline'), dateField(deadline)),
        error,
      ],
      async () => {
        if (!check(true)) return;
        try {
          await setSetting('goalType', type.value);
          await setSetting('heightCm', height.value);
          await setSetting('age', age.value);
          if (weight.value) {
            await saveBodyWeight(todayLocal(), weight.value);
          }
          const current = (await getBodyWeights()).at(-1)?.kg;
          if (target.value && deadline.value && current !== undefined) {
            await saveWeightGoal(target.value, deadline.value, current, todayLocal());
          }
          await experienceStep();
        } catch (problem) {
          error.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
        }
      },
    );
  }

  async function experienceStep(): Promise<void> {
    const experience = select(
      [
        ['new', t('onboarding.expNew')],
        ['1to3', t('onboarding.exp1to3')],
        ['3plus', t('onboarding.exp3plus')],
      ],
      (await getSetting('experience')) || 'new',
      () => undefined,
    );
    const perWeek = numberInput('integer', await getSetting('perWeek'), 1);
    const duration = numberInput('integer', await getSetting('usualDuration'), 3);
    const error = h('p', { className: 'error', role: 'alert' });
    const check = checker(error, [
      [perWeek, (input) => Number(input.value) >= 1 && Number(input.value) <= 7, t('onboarding.badPerWeek')],
      [duration, (input) => Number(input.value) >= 10 && Number(input.value) <= 300, t('onboarding.badDuration')],
    ]);

    layout(
      t('onboarding.step3'),
      3,
      [
        field(t('onboarding.experience'), experience),
        field(t('onboarding.perWeek'), perWeek),
        field(t('onboarding.duration'), duration),
        error,
      ],
      async () => {
        if (!check(true)) return;
        await setSetting('experience', experience.value);
        await setSetting('perWeek', perWeek.value);
        await setSetting('usualDuration', duration.value);
        await splitStep();
      },
    );
  }

  async function splitStep(): Promise<void> {
    const split = select(
      [
        ['upperLower', t('onboarding.splitUpperLower')],
        ['fullBody', t('onboarding.splitFullBody')],
        ['custom', t('onboarding.splitCustom')],
      ],
      (await getSetting('split')) || 'upperLower',
      () => undefined,
    );

    layout(
      t('onboarding.step4'),
      4,
      [field(t('onboarding.split'), split)],
      async () => {
        await setSetting('split', split.value);
        await finish();
      },
    );
  }

  await languageStep();
}
