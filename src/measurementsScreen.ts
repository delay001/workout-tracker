import { lineChart } from './chart';
import { formatDate, todayLocal } from './dates';
import { field, h } from './dom';
import {
  deleteMeasurement,
  getMeasurements,
  latestChange,
  MEASUREMENT_FIELDS,
  measurementSeries,
  saveMeasurement,
} from './measurements';

let shownKey = 'waist';

export async function renderMeasurementsView(root: HTMLElement): Promise<void> {
  const measurements = await getMeasurements();
  const series = measurementSeries(measurements, shownKey);
  const change = latestChange(series);
  const date = h('input', { type: 'date', value: todayLocal() });
  const inputs = MEASUREMENT_FIELDS.map(([key]) => [
    key,
    h('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off' }),
  ] as const);
  const error = h('p', { className: 'error', role: 'alert' });
  const shownLabel = MEASUREMENT_FIELDS.find(([key]) => key === shownKey)?.[1] ?? '';

  const fieldChips = MEASUREMENT_FIELDS.map(([key, label]) =>
    h(
      'label',
      { className: 'chip' },
      h('input', {
        type: 'radio',
        name: 'measurement',
        checked: key === shownKey,
        onchange: () => {
          shownKey = key;
          void renderMeasurementsView(root);
        },
      }),
      label,
    ),
  );

  const rows = [...measurements].reverse().map((item) =>
    h(
      'li',
      { className: 'set-row' },
      `${formatDate(item.date)}: заполнено ${Object.keys(item.values).length} из ${MEASUREMENT_FIELDS.length}`,
      h(
        'button',
        {
          type: 'button',
          className: 'remove-button',
          ariaLabel: `Удалить замеры за ${formatDate(item.date)}`,
          onclick: async () => {
            await deleteMeasurement(item.date);
            await renderMeasurementsView(root);
          },
        },
        '✕',
      ),
    ),
  );

  root.replaceChildren(
    h('div', { className: 'chips', role: 'radiogroup', ariaLabel: 'Замер' }, ...fieldChips),
    ...(series.length > 0
      ? [lineChart(series, 'см', `График замера: ${shownLabel}`)]
      : [h('p', { className: 'hint' }, `Замеров «${shownLabel}» пока нет`)]),
    ...(change === undefined
      ? []
      : [h('p', { className: 'hint' }, `К прошлому замеру: ${change > 0 ? '+' : ''}${change} см`)]),
    h('h2', {}, 'Новые замеры, см'),
    h(
      'form',
      {
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            const texts = Object.fromEntries(inputs.map(([key, input]) => [key, input.value]));
            await saveMeasurement(date.value || todayLocal(), texts);
            await renderMeasurementsView(root);
          } catch (problem) {
            error.textContent = problem instanceof Error ? problem.message : 'Не удалось сохранить';
          }
        },
      },
      field('Дата', date),
      h(
        'div',
        { className: 'set-inputs' },
        ...MEASUREMENT_FIELDS.map(([, label], index) => field(label, inputs[index][1])),
      ),
      error,
      h('button', { type: 'submit', className: 'button' }, 'Записать замеры'),
    ),
    h('ol', { className: 'set-list' }, ...rows),
  );
}
