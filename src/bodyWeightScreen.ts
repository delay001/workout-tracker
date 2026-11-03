import {
  deleteBodyWeight,
  finishWeightGoal,
  getBodyWeights,
  getGoalHistory,
  getWeightGoal,
  goalStatus,
  movingAverage,
  saveBodyWeight,
  saveWeightGoal,
  trendChange,
} from './bodyWeight';
import { lineChart } from './chart';
import { formatDate, todayLocal } from './dates';
import { collapsible, emptyState, dateField, field, h } from './dom';
import { t } from './i18n';
import { filterByPeriod, type Period } from './progress';
import { numberInput, periodChips } from './ui';
import { formatWeight, toWeight, weightUnit } from './units';

let shownPeriod: Period = 'all';

const signed = (kg: number): string => `${kg > 0 ? '+' : ''}${formatWeight(kg)}`;

export async function renderBodyWeightView(root: HTMLElement): Promise<void> {
  const weights = await getBodyWeights();
  const goal = await getWeightGoal();
  const pastGoals = await getGoalHistory();
  const today = todayLocal();
  const trend = movingAverage(weights);
  const current = weights.at(-1)?.kg;

  const date = h('input', { type: 'date', value: today });
  const kg = numberInput('decimal');
  const error = h('p', { className: 'error', role: 'alert' });
  const chartBox = h('div');
  const refresh = (): Promise<void> => renderBodyWeightView(root);

  function showChart(): void {
    const toDatum = weights.map((item) => ({ date: item.date, value: toWeight(item.kg) }));
    const points = filterByPeriod(toDatum, shownPeriod, today);
    const shownTrend = filterByPeriod(
      trend.map((item) => ({ ...item, value: toWeight(item.value) })),
      shownPeriod,
      today,
    );
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
    const target = numberInput('decimal', goal ? String(toWeight(goal.targetKg)) : '');
    const deadline = h('input', { type: 'date', value: goal?.deadline ?? '' });
    const goalError = h('p', { className: 'error', role: 'alert' });
    const form = h(
      'form',
      {
        hidden: Boolean(goal),
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            if (current === undefined) {
              throw new Error(t('goal.needWeight'));
            }
            await saveWeightGoal(target.value, deadline.value, current, today);
            await refresh();
          } catch (problem) {
            goalError.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
          }
        },
      },
      h(
        'div',
        { className: 'set-inputs' },
        field(t('goal.target', { unit: weightUnit() }), target),
        field(t('goal.deadline'), dateField(deadline)),
      ),
      goalError,
      h('button', { type: 'submit', className: 'button' }, t('goal.set')),
    );

    const section: HTMLElement[] = [h('h2', {}, t('goal.title'))];
    if (goal) {
      const status = goalStatus(goal, trend, today);
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
        h('p', { className: 'set-row' }, t('goal.required', { value: signed(status.requiredPerWeek) })),
        ...(status.actualPerWeek === undefined
          ? []
          : [h('p', { className: 'set-row' }, t('goal.actual', { value: signed(status.actualPerWeek) }))]),
        h('p', { className: 'set-row' }, h('strong', {}, t(`goal.status${status.status}`))),
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

  const weekChange = trendChange(trend, 7);
  const monthChange = trendChange(trend, 30);

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
    ...(weekChange === undefined
      ? []
      : [h('p', { className: 'hint' }, t('trend.week', { value: signed(weekChange) }))]),
    ...(monthChange === undefined
      ? []
      : [h('p', { className: 'hint' }, t('trend.month', { value: signed(monthChange) }))]),
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
        field(t('weight.input', { unit: weightUnit() }), kg),
      ),
      error,
      h('button', { type: 'submit', className: 'button' }, t('weight.record')),
    ),
    h('div', { className: 'set-list' }, ...collapsible(rows, 3)),
  );
}
