import { formatDate } from './dates';
import { h } from './dom';
import { LOCALE } from './i18n';

export interface ChartDatum {
  date: string;
  value: number;
}

export interface ChartPoint extends ChartDatum {
  x: number;
  y: number;
}

export interface ChartExtras {
  // Линия тренда той же длины, что и основной ряд
  trend?: ChartDatum[];
  // Горизонтальная линия цели
  goal?: number;
  // Подробность к точке, например подход, из которого получено значение
  detail?: (point: ChartDatum) => string;
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

// Координаты на графике: ось X идет по датам, поэтому пропуски между записями видны
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

export interface Bar {
  value: number;
  // Подпись под столбцом и полное описание для строки над графиком
  label: string;
  readout: string;
  // Подпись над столбцом, если число нужно показать иначе, например часы
  text?: string;
}

// Столбцы с числом над каждым. Столбец можно нажать: описание показывается над графиком.
export function barChart(bars: Bar[], label: string): HTMLElement {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  const step = (BOX.right - 12 - 12) / bars.length;
  const width = Math.min(28, step * 0.7);
  // Подписи под столбцами только если они не налезают друг на друга
  const labelEvery = Math.ceil(bars.length / 7);
  const readout = h('p', { className: 'chart-readout' });
  const figure = h('figure', { className: 'chart' }, readout);
  const show = (index: number): void => {
    readout.textContent = bars[index].readout;
    figure.querySelectorAll('.chart-bar').forEach((bar, barIndex) => bar.classList.toggle('chart-bar-active', barIndex === index));
  };
  figure.insertAdjacentHTML(
    'beforeend',
    `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">
      <line class="chart-grid" x1="12" x2="${BOX.right}" y1="${BOX.bottom}" y2="${BOX.bottom}"/>
      ${bars
        .map((bar, index) => {
          const x = 12 + step * index + (step - width) / 2;
          const height = (bar.value / max) * (BOX.bottom - BOX.top - 14);
          return `<rect class="chart-bar" x="${x}" y="${BOX.bottom - height}" width="${width}" height="${height}" rx="4"/>
            <text x="${x + width / 2}" y="${BOX.bottom - height - 4}" text-anchor="middle">${bar.text ?? bar.value}</text>
            ${index % labelEvery === 0 ? `<text x="${x + width / 2}" y="${HEIGHT - 6}" text-anchor="middle">${bar.label}</text>` : ''}
            <rect class="chart-hit" x="${12 + step * index}" y="${BOX.top}" width="${step}" height="${HEIGHT - BOX.top}"/>`;
        })
        .join('')}
    </svg>`,
  );
  figure.querySelector('svg')?.setAttribute('aria-label', label);
  show(bars.length - 1);
  figure.querySelectorAll('.chart-hit').forEach((target, index) => {
    const reveal = (): void => show(index);
    target.addEventListener('click', reveal);
    target.addEventListener('pointerenter', reveal);
  });
  return figure;
}

// Линейный график по датам. Точку можно нажать: значение показывается над графиком.
export function lineChart(
  data: ChartDatum[],
  unit: string,
  label: string,
  formatWhen: (date: string) => string = formatDate,
  extras: ChartExtras = {},
): HTMLElement {
  const points = chartPoints(data, BOX);
  const trend = (extras.trend ?? []).map((item, index) => ({ ...item, x: points[index]?.x ?? 0 }));
  const values = [...data, ...(extras.trend ?? [])].map((item) => item.value);
  if (extras.goal !== undefined) {
    values.push(extras.goal);
  }
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const yOf = (value: number): number => BOX.bottom - ((value - min) / span) * (BOX.bottom - BOX.top);
  const number = (value: number): string => value.toLocaleString(LOCALE);
  const readout = h('p', { className: 'chart-readout' });
  const show = (index: number): void => {
    const item = data[index];
    const detail = extras.detail?.(item);
    readout.textContent = `${number(item.value)} ${unit}, ${formatWhen(item.date)}${detail ? ` — ${detail}` : ''}`;
    figure.querySelectorAll('.chart-dot').forEach((dot, dotIndex) => {
      dot.classList.toggle('chart-dot-active', dotIndex === index);
    });
  };

  const figure = h('figure', { className: 'chart' }, readout);
  figure.insertAdjacentHTML(
    'beforeend',
    `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img">
      <line class="chart-grid" x1="${BOX.left}" x2="${BOX.right}" y1="${BOX.top}" y2="${BOX.top}"/>
      <line class="chart-grid" x1="${BOX.left}" x2="${BOX.right}" y1="${BOX.bottom}" y2="${BOX.bottom}"/>
      <text x="${BOX.left - 6}" y="${BOX.top + 4}" text-anchor="end">${number(Math.max(...values))}</text>
      <text x="${BOX.left - 6}" y="${BOX.bottom + 4}" text-anchor="end">${number(Math.min(...values))}</text>
      <text x="${BOX.left}" y="${HEIGHT - 6}">${formatWhen(data[0].date)}</text>
      <text x="${BOX.right}" y="${HEIGHT - 6}" text-anchor="end">${formatWhen(data[data.length - 1].date)}</text>
      ${extras.goal === undefined ? '' : `<line class="chart-goal" x1="${BOX.left}" x2="${BOX.right}" y1="${yOf(extras.goal)}" y2="${yOf(extras.goal)}"/>`}
      ${extras.trend ? `<polyline class="chart-trend" points="${trend.map(({ x, value }) => `${x},${yOf(value)}`).join(' ')}"/>` : ''}
      <polyline class="chart-line" points="${points.map(({ x, value }) => `${x},${yOf(value)}`).join(' ')}"/>
      ${points.map(({ x, value }) => `<circle class="chart-dot" cx="${x}" cy="${yOf(value)}" r="4"/>`).join('')}
      ${points.map(({ x, value }) => `<circle class="chart-hit" cx="${x}" cy="${yOf(value)}" r="16"/>`).join('')}
    </svg>`,
  );

  // Подпись ставится отдельно: в ней название упражнения, и как разметка оно могло бы сломать график
  figure.querySelector('svg')?.setAttribute('aria-label', label);
  show(data.length - 1);
  figure.querySelectorAll('.chart-hit').forEach((target, index) => {
    const reveal = (): void => show(index);
    target.addEventListener('click', reveal);
    target.addEventListener('pointerenter', reveal);
  });

  return figure;
}
