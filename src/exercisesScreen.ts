import { getBodyWeights } from './bodyWeight';
import { lineChart, type ChartDatum } from './chart';
import { formatDate, todayLocal } from './dates';
import type { Exercise } from './db';
import { h } from './dom';
import { t } from './i18n';
import {
  exerciseSummary,
  filterByPeriod,
  historyRecords,
  minutesSeries,
  oneRepMaxSeries,
  tonnageSeries,
  workingWeightSeries,
  type Period,
} from './progress';
import type { Sex } from './formulas';
import { STANDARDS, strengthLevel } from './levels';
import { getSetting } from './settings';
import { periodChips, radioChips } from './ui';
import { formatWeight, toWeight, weightUnit } from './units';
import {
  bestResult,
  formatSet,
  getExerciseHistory,
  getUsedExercises,
  isCardio,
  type BestResult,
  type LastPerformance,
} from './workouts';

type Metric = 'oneRepMax' | 'weight' | 'tonnage';

const inUnits = (series: ChartDatum[]): ChartDatum[] =>
  series.map((point) => ({ ...point, value: toWeight(point.value) }));

const METRICS: Record<Metric, (history: LastPerformance[]) => ChartDatum[]> = {
  oneRepMax: (history) => inUnits(oneRepMaxSeries(history)),
  weight: (history) => inUnits(workingWeightSeries(history)),
  tonnage: (history) => inUnits(tonnageSeries(history)),
};

let shownMetric: Metric = 'oneRepMax';
let shownPeriod: Period = 'all';

// В подтягиваниях поднимается вес тела, поэтому он входит в расчёт 1ПМ
function pullUpOneRepMax(history: LastPerformance[], bodyKg: number): number | undefined {
  const values = history
    .flatMap((entry) => entry.sets)
    .filter((set) => !set.warmup && set.reps <= 12)
    .map((set) => (bodyKg + set.weight) * (1 + set.reps / 30));
  return values.length > 0 ? Math.max(...values) : undefined;
}

function formatBest(best: BestResult): string {
  const set =
    best.set.minutes === undefined
      ? t('unit.setValue', { weight: formatWeight(best.set.weight), reps: best.set.reps })
      : formatSet(best.set);
  return t('exercise.bestValue', { set, date: formatDate(best.date) });
}

const kilograms = (value?: number): string | undefined =>
  value === undefined ? undefined : formatWeight(value);

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
      ...(used.length === 0 ? [h('p', { className: 'hint' }, t('exercise.noneYet'))] : items),
    );
  }

  async function showExercise(exercise: Exercise): Promise<void> {
    const history = await getExerciseHistory(exercise.id);
    const best = bestResult(history);
    const summary = exerciseSummary(history, todayLocal());
    const records = historyRecords(history);
    const bodyKg = (await getBodyWeights()).at(-1)?.kg;
    const sex: Sex = (await getSetting('sex')) === 'female' ? 'female' : 'male';
    const bodyweightMove = exercise.name === 'Подтягивания';
    const levelBase = bodyweightMove && bodyKg ? pullUpOneRepMax(history, bodyKg) : summary.bestOneRepMax;
    const level = bodyKg && levelBase ? strengthLevel(exercise.name, levelBase, bodyKg, sex) : undefined;
    const cardio = isCardio(exercise);
    const chartBox = h('div');

    const currentSeries = (): ChartDatum[] =>
      cardio ? minutesSeries(history) : METRICS[shownMetric](history);
    const unit = (): string => (cardio ? t('unit.minutes') : weightUnit());

    function showChart(): void {
      const points = filterByPeriod(currentSeries(), shownPeriod, todayLocal());
      chartBox.replaceChildren(
        points.length > 0
          ? lineChart(points, unit(), t('exercise.progress', { name: exercise.name }))
          : h('p', { className: 'hint' }, t('summary.noPeriodData')),
      );
    }

    // Фильтры нужны только там, где есть что сравнивать
    const hasChart = history.length > 1;

    const summaryRows: [string, string | undefined][] = [
      [t('summary.times'), String(summary.times)],
      [t('summary.first'), summary.firstDate && formatDate(summary.firstDate)],
      [t('summary.last'), summary.lastDate && formatDate(summary.lastDate)],
      ...(cardio
        ? []
        : ([
            [t('summary.bestOneRepMax'), kilograms(summary.bestOneRepMax)],
            [t('summary.currentOneRepMax'), kilograms(summary.currentOneRepMax)],
            [
              t('summary.fromPeak'),
              summary.fromPeak === undefined ? undefined : t('summary.percent', { value: summary.fromPeak }),
            ],
            [t('summary.maxTonnage'), kilograms(summary.maxTonnage)],
          ] as [string, string | undefined][])),
    ];

    if (hasChart) {
      showChart();
    }

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
        ...(hasChart
          ? [
              ...(cardio
                ? []
                : [
                    radioChips<Metric>(
                      'exercise-metric',
                      t('summary.metric'),
                      [
                        ['oneRepMax', t('metric.oneRepMax')],
                        ['weight', t('metric.weight')],
                        ['tonnage', t('metric.tonnage')],
                      ],
                      shownMetric,
                      (value) => {
                        shownMetric = value;
                        showChart();
                      },
                    ),
                  ]),
              periodChips('exercise-period', shownPeriod, (value) => {
                shownPeriod = value;
                showChart();
              }),
              chartBox,
            ]
          : []),
        ...(level
          ? [
              h(
                'p',
                { className: 'set-row' },
                t('level.title'),
                h('strong', {}, level.level ? t(`level.${level.level}`) : t('level.belowNovice')),
              ),
              ...(level.next && level.missingKg !== undefined
                ? [
                    h(
                      'p',
                      { className: 'hint' },
                      t('level.next', { level: t(`level.${level.next}`), weight: formatWeight(level.missingKg) }),
                    ),
                  ]
                : []),
            ]
          : STANDARDS[exercise.name] && !bodyKg
            ? [h('p', { className: 'hint' }, t('level.needWeight'))]
            : []),
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
