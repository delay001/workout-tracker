import { chartPoints, deleteBodyWeight, getBodyWeights, saveBodyWeight } from './bodyWeight';
import { formatDate, todayLocal } from './dates';
import type { BodyWeight } from './db';
import { field, h } from './dom';

const WIDTH = 340;
const HEIGHT = 180;
const BOX = { left: 42, right: WIDTH - 12, top: 12, bottom: HEIGHT - 24 };

function chart(weights: BodyWeight[]): HTMLElement {
  const points = chartPoints(weights, BOX);
  const kgs = weights.map((item) => item.kg);
  const readout = h('p', { className: 'chart-readout' });
  const show = (item: BodyWeight): void => {
    readout.textContent = `${item.kg} кг, ${formatDate(item.date)}`;
  };
  show(weights[weights.length - 1]);

  const line = points.map(({ x, y }) => `${x},${y}`).join(' ');
  const figure = h('figure', { className: 'chart' }, readout);
  figure.insertAdjacentHTML(
    'beforeend',
    `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="График веса тела">
      <line class="chart-grid" x1="${BOX.left}" x2="${BOX.right}" y1="${BOX.top}" y2="${BOX.top}"/>
      <line class="chart-grid" x1="${BOX.left}" x2="${BOX.right}" y1="${BOX.bottom}" y2="${BOX.bottom}"/>
      <text x="${BOX.left - 6}" y="${BOX.top + 4}" text-anchor="end">${Math.max(...kgs)}</text>
      <text x="${BOX.left - 6}" y="${BOX.bottom + 4}" text-anchor="end">${Math.min(...kgs)}</text>
      <text x="${BOX.left}" y="${HEIGHT - 6}">${formatDate(weights[0].date)}</text>
      <text x="${BOX.right}" y="${HEIGHT - 6}" text-anchor="end">${formatDate(weights[weights.length - 1].date)}</text>
      <polyline class="chart-line" points="${line}"/>
      ${points.map(({ x, y }) => `<circle class="chart-dot" cx="${x}" cy="${y}" r="4"/>`).join('')}
      ${points.map(({ x, y }) => `<circle class="chart-hit" cx="${x}" cy="${y}" r="16"/>`).join('')}
    </svg>`,
  );

  // Точку можно нажать или навести на неё: значение показывается над графиком
  figure.querySelectorAll('.chart-hit').forEach((target, index) => {
    const reveal = (): void => show(weights[index]);
    target.addEventListener('click', reveal);
    target.addEventListener('pointerenter', reveal);
  });

  return figure;
}

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
    ...(weights.length > 0 ? [chart(weights)] : [h('p', { className: 'hint' }, 'Записей веса пока нет')]),
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
