import { lineChart, type ChartDatum } from './chart';
import { formatDate, todayLocal } from './dates';
import type { Exercise } from './db';
import { h } from './dom';
import {
  exerciseSummary,
  filterByPeriod,
  historyRecords,
  oneRepMaxSeries,
  tonnageSeries,
  workingWeightSeries,
  type Period,
} from './progress';
import {
  bestResult,
  formatSet,
  getExerciseHistory,
  getUsedExercises,
  type BestResult,
  type LastPerformance,
} from './workouts';
import { LOCALE, t } from './i18n';

type Metric = 'oneRepMax' | 'weight' | 'tonnage';

const METRICS: Record<Metric, (history: LastPerformance[]) => [ChartDatum[], string]> = {
  oneRepMax: (history) => [oneRepMaxSeries(history), t('unit.kg')],
  weight: (history) => [workingWeightSeries(history), t('unit.kg')],
  tonnage: (history) => [tonnageSeries(history), t('unit.kg')],
};

const PERIODS: Period[] = ['1m', '3m', '1y', 'all'];

let shownMetric: Metric = 'oneRepMax';
let shownPeriod: Period = 'all';

function kilograms(value?: number): string | undefined {
  return value === undefined ? undefined : t('unit.kgValue', { value: value.toLocaleString(LOCALE) });
}

function formatBest(best: BestResult): string {
  return t('exercise.bestValue', { weight: best.set.weight, reps: best.set.reps, date: formatDate(best.date) });
}

export async function renderExercisesScreen(root: HTMLElement): Promise<void> {
  async function showList(): Promise<void> {
    const used = await getUsedExercises();

    const items: HTMLElement[] = [];
    let lastGroup: string | undefined;
    for (const { exercise, best } of used) {
      const group = exercise.muscleGroup ?? t('common.noGroup');
      if (group !== lastGroup) {
        items.push(h('h2', { className: 'group-heading' }, group));
        lastGroup = group;
      }
      items.push(
        h(
          'button',
          { type: 'button', className: 'list-button', onclick: () => void showExercise(exercise) },
          exercise.name,
          h('span', { className: 'muscle-group' }, best ? t('exercise.best', { best: formatBest(best) }) : ''),
        ),
      );
    }

    root.replaceChildren(
      ...(used.length === 0
        ? [h('p', { className: 'hint' }, t('exercise.noneYet'))]
        : items),
    );
  }

  async function showExercise(exercise: Exercise): Promise<void> {
    const history = await getExerciseHistory(exercise.id);
    const best = bestResult(history);
    const summary = exerciseSummary(history, todayLocal());
    const records = historyRecords(history);
    const chartBox = h('div');

    function showChart(): void {
      const [series, unit] = METRICS[shownMetric](history);
      const points = filterByPeriod(series, shownPeriod, todayLocal());
      chartBox.replaceChildren(
        points.length > 1
          ? lineChart(points, unit, t('exercise.progress', { name: exercise.name }))
          : h('p', { className: 'hint' }, t('summary.noChart')),
      );
    }

    function radioChips<T extends string>(
      group: string,
      label: string,
      options: [T, string][],
      isChecked: (value: T) => boolean,
      choose: (value: T) => void,
    ): HTMLElement {
      return h(
        'div',
        { className: 'chips', role: 'radiogroup', ariaLabel: label },
        ...options.map(([value, text]) =>
          h(
            'label',
            { className: 'chip' },
            h('input', {
              type: 'radio',
              name: group,
              checked: isChecked(value),
              onchange: () => {
                choose(value);
                showChart();
              },
            }),
            text,
          ),
        ),
      );
    }

    const summaryRows: [string, string | undefined][] = [
      [t('summary.times'), String(summary.times)],
      [t('summary.first'), summary.firstDate && formatDate(summary.firstDate)],
      [t('summary.last'), summary.lastDate && formatDate(summary.lastDate)],
      [t('summary.bestOneRepMax'), kilograms(summary.bestOneRepMax)],
      [t('summary.currentOneRepMax'), kilograms(summary.currentOneRepMax)],
      [
        t('summary.fromPeak'),
        summary.fromPeak === undefined ? undefined : t('summary.percent', { value: summary.fromPeak }),
      ],
      [t('summary.maxTonnage'), kilograms(summary.maxTonnage)],
    ];

    showChart();

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h2', {}, exercise.name),
        ...(exercise.muscleGroup ? [h('p', { className: 'hint' }, exercise.muscleGroup)] : []),
        ...(best
          ? [
              h(
                'section',
                { className: 'last-time' },
                h('h2', {}, t('exercise.bestResult')),
                h('p', {}, formatBest(best)),
              ),
            ]
          : []),
        radioChips(
          'exercise-metric',
          t('summary.metric'),
          [
            ['oneRepMax', t('metric.oneRepMax')],
            ['weight', t('metric.weight')],
            ['tonnage', t('metric.tonnage')],
          ],
          (value) => value === shownMetric,
          (value) => {
            shownMetric = value;
          },
        ),
        radioChips(
          'exercise-period',
          t('summary.period'),
          PERIODS.map((period) => [period, t(`period.${period}`)]),
          (value) => value === shownPeriod,
          (value) => {
            shownPeriod = value;
          },
        ),
        chartBox,
        ...summaryRows.flatMap(([label, value]) =>
          value === undefined ? [] : [h('p', { className: 'set-row' }, label, h('strong', {}, value))],
        ),
        ...history.map((entry, entryIndex) =>
          h(
            'article',
            { className: 'card' },
            h('h2', { className: 'history-date' }, formatDate(entry.date)),
            h(
              'ol',
              { className: 'set-list' },
              ...entry.sets.map((set, setIndex) =>
                h(
                  'li',
                  {},
                  formatSet(set),
                  ...(records[entryIndex][setIndex]
                    ? [h('span', { className: 'record' }, records[entryIndex][setIndex])]
                    : []),
                ),
              ),
            ),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'button button-secondary bottom-action',
            onclick: () => void showList(),
          },
          t('common.back'),
        ),
      ),
    );
  }

  await showList();
}
