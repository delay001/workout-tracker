import {
  BODY_KG_MAX,
  BODY_KG_MIN,
  deleteBodyWeight,
  finishWeightGoal,
  getBodyWeights,
  getGoalHistory,
  getWeightGoal,
  goalStatus,
  movingAverage,
  saveBodyWeight,
  saveWeightGoal,
} from './bodyWeight';
import { lineChart } from './chart';
import { formatDate, todayLocal } from './dates';
import { collapsible, emptyState, dateField, field, h } from './dom';
import { LOCALE, t } from './i18n';
import { filterByPeriod, type Period } from './progress';
import { bodyWeightInput, periodChips } from './ui';
import { formatWeight, fromWeight, toWeight, weightUnit } from './units';

let shownPeriod: Period = 'all';

const signed = (kg: number): string => `${kg > 0 ? '+' : ''}${formatWeight(kg)}`;
const signedValue = (value: number): string => `${value > 0 ? '+' : ''}${value.toLocaleString(LOCALE)} ${weightUnit()}`;

export async function renderBodyWeightView(root: HTMLElement): Promise<void> {
  const weights = await getBodyWeights();
  const goal = await getWeightGoal();
  const pastGoals = await getGoalHistory();
  const today = todayLocal();
  const trend = movingAverage(weights);
  const current = weights.at(-1)?.kg;

  const date = h('input', { type: 'date', value: today });
  const kg = bodyWeightInput();
  const error = h('p', { className: 'error', role: 'alert' });
  const chartBox = h('div');
  const trendLine = h('p', { className: 'hint' });
  const refresh = (): Promise<void> => renderBodyWeightView(root);

  function showChart(): void {
    const toDatum = weights.map((item) => ({ date: item.date, value: toWeight(item.kg) }));
    const points = filterByPeriod(toDatum, shownPeriod, today);
    const shownTrend = filterByPeriod(
      trend.map((item) => ({ ...item, value: toWeight(item.value) })),
      shownPeriod,
      today,
    );
    const first = shownTrend[0];
    const last = shownTrend.at(-1);
    const change = first && last && first !== last ? Math.round((last.value - first.value) * 10) / 10 : undefined;
    trendLine.textContent =
      change === undefined ? '' : t('trend.period', { period: t(`trend.${shownPeriod}`), value: signedValue(change) });
    chartBox.replaceChildren(
      points.length > 0
        ? lineChart(points, weightUnit(), t('weight.chart'), undefined, {
            trend: shownTrend,
            goal: goal ? toWeight(goal.targetKg) : undefined,
          })
        : weights.length === 0
          ? emptyState('⚖️', t('weight.empty'))
          : h('p', { className: 'hint' }, t('summary.noPeriodData')),
    );
  }

  function goalSection(): HTMLElement[] {
    const target = bodyWeightInput(goal ? String(toWeight(goal.targetKg)) : '');
    // Стартовый вес, от которого считается прогресс. По умолчанию — последнее взвешивание.
    const start = bodyWeightInput(current === undefined ? '' : String(toWeight(current)));
    const deadline = h('input', { type: 'date', value: goal?.deadline ?? '' });
    const goalError = h('p', { className: 'error', role: 'alert' });
    const form = h(
      'form',
      {
        hidden: Boolean(goal),
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            const startKg = fromWeight(Number(start.value.replace(',', '.')));
            if (start.value.trim() === '' || !(startKg >= BODY_KG_MIN && startKg <= BODY_KG_MAX)) {
              throw new Error(t('goal.needStart'));
            }
            await saveWeightGoal(target.value, deadline.value, Math.round(startKg * 10) / 10, today);
            await refresh();
          } catch (problem) {
            goalError.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
          }
        },
      },
      h(
        'div',
        { className: 'set-inputs' },
        field(t('goal.start', { unit: weightUnit() }), start, true),
        field(t('goal.target', { unit: weightUnit() }), target, true),
      ),
      field(t('goal.deadline'), dateField(deadline), true),
      goalError,
      h('button', { type: 'submit', className: 'button' }, t('goal.set')),
    );

    const section: HTMLElement[] = [h('h2', {}, t('goal.title'))];
    if (goal) {
      const status = goalStatus(goal, trend, today, current);
      const fill = h('div', { className: 'progress-fill' });
      fill.style.width = `${status.percent}%`;
      section.push(
        h(
          'div',
          { className: 'progress' },
          h('p', {}, `${formatWeight(goal.startKg)} → ${formatWeight(goal.targetKg)}, ${formatDate(goal.deadline)}`),
          h(
            'div',
            {
              className: 'progress-track',
              role: 'progressbar',
              ariaValueNow: String(status.percent),
              ariaValueMax: '100',
              ariaLabel: t('goal.title'),
            },
            fill,
          ),
        ),
        h('p', { className: 'set-row' }, t('goal.left', { weight: formatWeight(Math.abs(status.leftKg)), days: status.leftDays })),
        // Темп одной строкой: нужный и фактический
        h(
          'p',
          { className: 'hint' },
          [
            t('goal.required', { value: signed(status.requiredPerWeek) }),
            ...(status.actualPerWeek === undefined ? [] : [t('goal.actual', { value: signed(status.actualPerWeek) })]),
          ].join(' · '),
        ),
        ...(status.tooFast ? [h('p', { className: 'error' }, t('goal.tooFast'))] : []),
        h(
          'div',
          { className: 'card-actions' },
          h(
            'button',
            {
              type: 'button',
              className: 'button button-secondary',
              onclick: () => {
                form.hidden = !form.hidden;
              },
            },
            t('goal.change'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'button button-secondary',
              onclick: async () => {
                await finishWeightGoal();
                await refresh();
              },
            },
            t('goal.finish'),
          ),
        ),
      );
    }
    section.push(form);
    if (pastGoals.length > 0) {
      section.push(h('p', { className: 'hint' }, t('goal.past', { count: pastGoals.length })));
    }
    return section;
  }

  const rows = [...weights].reverse().map((item) =>
    h(
      'div',
      { className: 'set-row' },
      t('weight.entry', { date: formatDate(item.date), weight: formatWeight(item.kg) }),
      h(
        'button',
        {
          type: 'button',
          className: 'remove-button',
          ariaLabel: t('weight.delete', { date: formatDate(item.date) }),
          onclick: async () => {
            await deleteBodyWeight(item.date);
            await refresh();
          },
        },
        '✕',
      ),
    ),
  );


  showChart();
  root.replaceChildren(
    ...(weights.length > 1
      ? [
          periodChips('weight-period', shownPeriod, (value) => {
            shownPeriod = value;
            showChart();
          }),
        ]
      : []),
    chartBox,
    trendLine,
    ...goalSection(),
    h('h2', {}, t('weight.record')),
    h(
      'form',
      {
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            await saveBodyWeight(date.value || today, kg.value);
            await refresh();
          } catch (problem) {
            error.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
          }
        },
      },
      h(
        'div',
        { className: 'set-inputs' },
        field(t('common.date'), dateField(date)),
        field(t('weight.input', { unit: weightUnit() }), kg, true),
      ),
      error,
      h('button', { type: 'submit', className: 'button' }, t('weight.record')),
    ),
    h('div', { className: 'set-list' }, ...collapsible(rows, 3)),
  );
}
