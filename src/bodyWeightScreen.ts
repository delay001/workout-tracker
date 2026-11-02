import { deleteBodyWeight, getBodyWeights, saveBodyWeight } from './bodyWeight';
import { lineChart } from './chart';
import { formatDate, todayLocal } from './dates';
import { field, h } from './dom';
import { t } from './i18n';

export async function renderBodyWeightView(root: HTMLElement): Promise<void> {
  const weights = await getBodyWeights();
  const date = h('input', { type: 'date', value: todayLocal() });
  const kg = h('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off' });
  const error = h('p', { className: 'error', role: 'alert' });

  const rows = [...weights].reverse().map((item) =>
    h(
      'li',
      { className: 'set-row' },
      t('weight.entry', { date: formatDate(item.date), kg: item.kg }),
      h(
        'button',
        {
          type: 'button',
          className: 'remove-button',
          ariaLabel: t('weight.delete', { date: formatDate(item.date) }),
          onclick: async () => {
            await deleteBodyWeight(item.date);
            await renderBodyWeightView(root);
          },
        },
        '✕',
      ),
    ),
  );

  root.replaceChildren(
    ...(weights.length > 0
      ? [lineChart(weights.map(({ date: when, kg: value }) => ({ date: when, value })), t('unit.kg'), t('weight.chart'))]
      : [h('p', { className: 'hint' }, t('weight.empty'))]),
    h(
      'form',
      {
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            await saveBodyWeight(date.value || todayLocal(), kg.value);
            await renderBodyWeightView(root);
          } catch (problem) {
            error.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
          }
        },
      },
      h('div', { className: 'set-inputs' }, field(t('common.date'), date), field(t('weight.input'), kg)),
      error,
      h('button', { type: 'submit', className: 'button' }, t('weight.record')),
    ),
    h('ol', { className: 'set-list' }, ...rows),
  );
}
