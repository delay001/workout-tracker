import { h } from './dom';
import { t } from './i18n';
import type { Period } from './progress';
import { stepValue } from './workouts';

// Поле только для чисел: лишние знаки убираются прямо при вводе
export function numberInput(kind: 'integer' | 'decimal', value = '', maxLength = 6): HTMLInputElement {
  const input = h('input', {
    type: 'text',
    inputMode: kind === 'integer' ? 'numeric' : 'decimal',
    autocomplete: 'off',
    maxLength,
    value,
  });
  input.oninput = () => {
    input.value =
      kind === 'integer'
        ? input.value.replace(/\D/g, '')
        : input.value
            .replace(',', '.')
            .replace(/[^\d.]/g, '')
            .replace(/(\..*)\./g, '$1');
  };
  return input;
}

export function stepper(input: HTMLInputElement, step: number, min: number, max?: number): HTMLElement {
  const stepButton = (label: string, name: string, delta: number): HTMLButtonElement =>
    h(
      'button',
      {
        type: 'button',
        className: 'step-button',
        ariaLabel: name,
        onclick: () => {
          input.value = stepValue(input.value, delta, min, max);
        },
      },
      label,
    );

  return h(
    'div',
    { className: 'stepper' },
    stepButton('−', t('set.decrease'), -step),
    input,
    stepButton('+', t('set.increase'), step),
  );
}

export function select(
  options: [string, string][],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const element = h('select', {}, ...options.map(([id, text]) => h('option', { value: id }, text)));
  element.value = value;
  element.onchange = () => onChange(element.value);
  return element;
}

export function radioChips<T extends string>(
  group: string,
  label: string,
  options: [T, string][],
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  return h(
    'div',
    { className: 'chips', role: 'radiogroup', ariaLabel: label },
    ...options.map(([id, text]) =>
      h(
        'label',
        { className: 'chip' },
        h('input', {
          type: 'radio',
          name: group,
          checked: id === value,
          onchange: () => onChange(id),
        }),
        text,
      ),
    ),
  );
}

export const PERIODS: Period[] = ['all', '1m', '3m', '6m', '1y'];

export function periodChips(group: string, value: Period, onChange: (value: Period) => void): HTMLElement {
  return radioChips(
    group,
    t('summary.period'),
    PERIODS.map((period): [Period, string] => [period, t(`period.${period}`)]),
    value,
    onChange,
  );
}
