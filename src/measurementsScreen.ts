import { lineChart } from './chart';
import { formatDate, todayLocal } from './dates';
import type { Measurement } from './db';
import { confirmDialog, field, h } from './dom';
import { t } from './i18n';
import {
  compareMeasurements,
  deleteMeasurement,
  getMeasurements,
  latestChange,
  MEASUREMENT_FIELDS,
  measurementSeries,
  saveMeasurement,
} from './measurements';
import { filterByPeriod, type Period } from './progress';
import { numberInput, periodChips, select } from './ui';
import { lengthUnit, toLength } from './units';

let shownKey = 'waist';
let shownPeriod: Period = 'all';

const withUnit = (label: string): string => t('measure.withUnit', { name: label, unit: lengthUnit() });

export async function renderMeasurementsView(root: HTMLElement, edited?: Measurement): Promise<void> {
  const measurements = await getMeasurements();
  const series = measurementSeries(measurements, shownKey).map((item) => ({
    ...item,
    value: toLength(item.value),
  }));
  const change = latestChange(series);
  const shownLabel = MEASUREMENT_FIELDS.find(([key]) => key === shownKey)?.[1] ?? '';
  const today = todayLocal();
  const refresh = (): Promise<void> => renderMeasurementsView(root);

  const date = h('input', { type: 'date', value: edited?.date ?? today });
  const inputs = MEASUREMENT_FIELDS.map(([key]) => {
    const value = edited?.values[key];
    return [key, numberInput('decimal', value === undefined ? '' : String(toLength(value)))] as const;
  });
  const error = h('p', { className: 'error', role: 'alert' });
  const chartBox = h('div');

  function showChart(): void {
    const points = filterByPeriod(series, shownPeriod, today);
    chartBox.replaceChildren(
      points.length > 0
        ? lineChart(points, lengthUnit(), t('measure.chart', { name: shownLabel }))
        : h('p', { className: 'hint' }, t('measure.empty', { name: shownLabel })),
    );
  }

  function compareSection(): HTMLElement[] {
    if (measurements.length < 2) {
      return [];
    }
    const options = measurements.map((item): [string, string] => [item.date, formatDate(item.date)]);
    let from = options[0][0];
    let to = options[options.length - 1][0];
    const result = h('div');

    const show = (): void => {
      const first = measurements.find((item) => item.date === from);
      const second = measurements.find((item) => item.date === to);
      const rows = first && second ? compareMeasurements(first, second) : [];
      result.replaceChildren(
        ...(rows.length > 0
          ? rows.map((row) =>
              h(
                'p',
                { className: 'set-row' },
                row.label,
                h(
                  'span',
                  {},
                  `${toLength(row.from)} → ${toLength(row.to)} (${row.change > 0 ? '+' : ''}${toLength(row.change)})`,
                ),
              ),
            )
          : [h('p', { className: 'hint' }, t('compare.none'))]),
      );
    };
    show();

    return [
      h('h2', {}, t('compare.title')),
      h(
        'div',
        { className: 'set-inputs' },
        field(t('compare.from'), select(options, from, (value) => {
          from = value;
          show();
        })),
        field(t('compare.to'), select(options, to, (value) => {
          to = value;
          show();
        })),
      ),
      result,
    ];
  }

  const rows = [...measurements].reverse().map((item) =>
    h(
      'li',
      { className: 'set-row' },
      h(
        'button',
        {
          type: 'button',
          className: 'set-text',
          ariaLabel: t('measure.edit', { date: formatDate(item.date) }),
          onclick: () => void renderMeasurementsView(root, item),
        },
        t('measure.entry', {
          date: formatDate(item.date),
          filled: Object.keys(item.values).length,
          total: MEASUREMENT_FIELDS.length,
        }),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'remove-button',
          ariaLabel: t('measure.delete', { date: formatDate(item.date) }),
          onclick: async () => {
            await deleteMeasurement(item.date);
            await refresh();
          },
        },
        '✕',
      ),
    ),
  );

  showChart();
  root.replaceChildren(
    field(
      t('measure.select'),
      select(MEASUREMENT_FIELDS, shownKey, (value) => {
        shownKey = value;
        void refresh();
      }),
    ),
    ...(series.length > 1
      ? [
          periodChips('measure-period', shownPeriod, (value) => {
            shownPeriod = value;
            showChart();
          }),
        ]
      : []),
    chartBox,
    ...(change === undefined
      ? []
      : [
          h(
            'p',
            { className: 'hint' },
            t('measure.change', { change: `${change > 0 ? '+' : ''}${change}`, unit: lengthUnit() }),
          ),
        ]),
    ...compareSection(),
    h('h2', {}, edited ? t('measure.edit', { date: formatDate(edited.date) }) : t('measure.new')),
    h(
      'form',
      {
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            const texts = Object.fromEntries(inputs.map(([key, input]) => [key, input.value]));
            const target = date.value || today;
            // За один день хранится одна запись, поэтому чужую запись на этой дате нельзя затирать молча
            const taken = target !== edited?.date && measurements.some((item) => item.date === target);
            if (taken && !(await confirmDialog(t('measure.replaceDate', { date: formatDate(target) })))) {
              return;
            }
            await saveMeasurement(target, texts);
            if (edited && target !== edited.date) {
              await deleteMeasurement(edited.date);
            }
            await refresh();
          } catch (problem) {
            error.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
          }
        },
      },
      field(t('common.date'), date),
      h(
        'div',
        { className: 'set-inputs' },
        ...MEASUREMENT_FIELDS.map(([, label], index) => field(withUnit(label), inputs[index][1])),
      ),
      error,
      h('button', { type: 'submit', className: 'button' }, edited ? t('common.save') : t('measure.record')),
      ...(edited
        ? [
            h(
              'button',
              { type: 'button', className: 'button button-secondary', onclick: () => void refresh() },
              t('set.cancel'),
            ),
          ]
        : []),
    ),
    h('ol', { className: 'set-list' }, ...rows),
  );
}
