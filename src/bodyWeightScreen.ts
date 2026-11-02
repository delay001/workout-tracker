import { deleteBodyWeight, getBodyWeights, saveBodyWeight } from './bodyWeight';
import { lineChart } from './chart';
import { formatDate, todayLocal } from './dates';
import { field, h } from './dom';

export async function renderBodyWeightView(root: HTMLElement): Promise<void> {
  const weights = await getBodyWeights();
  const date = h('input', { type: 'date', value: todayLocal() });
  const kg = h('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off' });
  const error = h('p', { className: 'error', role: 'alert' });

  const rows = [...weights].reverse().map((item) =>
    h(
      'li',
      { className: 'set-row' },
      `${formatDate(item.date)}: ${item.kg} кг`,
      h(
        'button',
        {
          type: 'button',
          className: 'remove-button',
          ariaLabel: `Удалить запись за ${formatDate(item.date)}`,
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
      ? [lineChart(weights.map(({ date: when, kg: value }) => ({ date: when, value })), 'кг', 'График веса тела')]
      : [h('p', { className: 'hint' }, 'Записей веса пока нет')]),
    h(
      'form',
      {
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            await saveBodyWeight(date.value || todayLocal(), kg.value);
            await renderBodyWeightView(root);
          } catch (problem) {
            error.textContent = problem instanceof Error ? problem.message : 'Не удалось сохранить';
          }
        },
      },
      h('div', { className: 'set-inputs' }, field('Дата', date), field('Вес, кг', kg)),
      error,
      h('button', { type: 'submit', className: 'button' }, 'Записать вес'),
    ),
    h('ol', { className: 'set-list' }, ...rows),
  );
}
