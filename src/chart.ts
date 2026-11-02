import { formatDate } from './dates';
import { h } from './dom';

export interface ChartDatum {
  date: string;
  value: number;
}

export interface ChartPoint extends ChartDatum {
  x: number;
  y: number;
}

export interface ChartBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const WIDTH = 340;
const HEIGHT = 180;
const BOX = { left: 52, right: WIDTH - 12, top: 12, bottom: HEIGHT - 24 };

function day(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

// Координаты на графике: ось X идёт по датам, поэтому пропуски между записями видны
export function chartPoints(data: ChartDatum[], box: ChartBox): ChartPoint[] {
  if (data.length === 0) {
    return [];
  }
  const firstDay = day(data[0].date);
  const daySpan = day(data[data.length - 1].date) - firstDay || 1;
  const min = Math.min(...data.map((item) => item.value));
  const valueSpan = Math.max(...data.map((item) => item.value)) - min || 1;

  return data.map((item) => ({
    ...item,
    x: box.left + ((day(item.date) - firstDay) / daySpan) * (box.right - box.left),
    y: box.bottom - ((item.value - min) / valueSpan) * (box.bottom - box.top),
  }));
}

// Линейный график по датам. Точку можно нажать: значение показывается над графиком.
export function lineChart(
  data: ChartDatum[],
  unit: string,
  label: string,
  formatWhen: (date: string) => string = formatDate,
): HTMLElement {
  const points = chartPoints(data, BOX);
  const values = data.map((item) => item.value);
  const number = (value: number): string => value.toLocaleString('ru-RU');
  const readout = h('p', { className: 'chart-readout' });
  const show = (item: ChartDatum): void => {
    readout.textContent = `${number(item.value)} ${unit}, ${formatWhen(item.date)}`;
  };
  show(data[data.length - 1]);

  const line = points.map(({ x, y }) => `${x},${y}`).join(' ');
  const figure = h('figure', { className: 'chart' }, readout);
  figure.insertAdjacentHTML(
    'beforeend',
    `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}">
      <line class="chart-grid" x1="${BOX.left}" x2="${BOX.right}" y1="${BOX.top}" y2="${BOX.top}"/>
      <line class="chart-grid" x1="${BOX.left}" x2="${BOX.right}" y1="${BOX.bottom}" y2="${BOX.bottom}"/>
      <text x="${BOX.left - 6}" y="${BOX.top + 4}" text-anchor="end">${number(Math.max(...values))}</text>
      <text x="${BOX.left - 6}" y="${BOX.bottom + 4}" text-anchor="end">${number(Math.min(...values))}</text>
      <text x="${BOX.left}" y="${HEIGHT - 6}">${formatWhen(data[0].date)}</text>
      <text x="${BOX.right}" y="${HEIGHT - 6}" text-anchor="end">${formatWhen(data[data.length - 1].date)}</text>
      <polyline class="chart-line" points="${line}"/>
      ${points.map(({ x, y }) => `<circle class="chart-dot" cx="${x}" cy="${y}" r="4"/>`).join('')}
      ${points.map(({ x, y }) => `<circle class="chart-hit" cx="${x}" cy="${y}" r="16"/>`).join('')}
    </svg>`,
  );

  figure.querySelectorAll('.chart-hit').forEach((target, index) => {
    const reveal = (): void => show(data[index]);
    target.addEventListener('click', reveal);
    target.addEventListener('pointerenter', reveal);
  });

  return figure;
}
