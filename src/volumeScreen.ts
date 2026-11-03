import { todayLocal } from './dates';
import { db } from './db';
import { h } from './dom';
import { t } from './i18n';
import { MUSCLES, type Muscle } from './muscles';
import { getSetting } from './settings';
import { radioChips } from './ui';
import {
  averageVolume,
  DEFAULT_NORMS,
  muscleVolume,
  pushPull,
  shiftDays,
  upperLowerBalance,
  volumeStatus,
  weekStart,
  type Volume,
} from './volume';
import { getFinishedWorkouts } from './workouts';

type Span = 'current' | 'previous' | 'average' | 'all';

let shownSpan: Span = 'current';

const week = (date: string): [string, string] => [date, shiftDays(date, 6)];

export async function getNorms(): Promise<Record<Muscle, [number, number]>> {
  const saved = await getSetting('volumeNorms');
  return saved ? { ...DEFAULT_NORMS, ...(JSON.parse(saved) as Record<Muscle, [number, number]>) } : DEFAULT_NORMS;
}

// Простые фигуры поверх силуэта: [мышца, x, y, ширина, высота]
const FRONT: [Muscle, number, number, number, number][] = [
  ['frontDelt', 22, 44, 18, 16],
  ['frontDelt', 80, 44, 18, 16],
  ['sideDelt', 12, 50, 10, 16],
  ['sideDelt', 98, 50, 10, 16],
  ['chest', 40, 46, 40, 24],
  ['biceps', 14, 68, 13, 26],
  ['biceps', 93, 68, 13, 26],
  ['forearms', 8, 96, 12, 28],
  ['forearms', 100, 96, 12, 28],
  ['abs', 44, 72, 32, 42],
  ['quads', 36, 124, 21, 56],
  ['quads', 63, 124, 21, 56],
  ['calves', 38, 192, 16, 42],
  ['calves', 66, 192, 16, 42],
];

const BACK: [Muscle, number, number, number, number][] = [
  ['traps', 40, 34, 40, 18],
  ['rearDelt', 22, 44, 18, 16],
  ['rearDelt', 80, 44, 18, 16],
  ['lats', 38, 54, 44, 42],
  ['triceps', 14, 68, 13, 26],
  ['triceps', 93, 68, 13, 26],
  ['forearms', 8, 96, 12, 28],
  ['forearms', 100, 96, 12, 28],
  ['glutes', 38, 98, 44, 26],
  ['hamstrings', 36, 126, 21, 54],
  ['hamstrings', 63, 126, 21, 54],
  ['calves', 38, 192, 16, 42],
  ['calves', 66, 192, 16, 42],
];

function bodyFigure(
  shapes: [Muscle, number, number, number, number][],
  label: string,
  statusOf: (muscle: Muscle) => string,
  onPick: (muscle: Muscle) => void,
): HTMLElement {
  const figure = h('figure', { className: 'body-figure' });
  figure.insertAdjacentHTML(
    'beforeend',
    `<svg viewBox="0 0 120 240" role="img" aria-label="${label}">
      <circle class="body-base" cx="60" cy="18" r="15"/>
      <rect class="body-base" x="34" y="36" width="52" height="88" rx="16"/>
      <rect class="body-base" x="6" y="42" width="22" height="86" rx="10"/>
      <rect class="body-base" x="92" y="42" width="22" height="86" rx="10"/>
      <rect class="body-base" x="34" y="118" width="24" height="118" rx="10"/>
      <rect class="body-base" x="62" y="118" width="24" height="118" rx="10"/>
      ${shapes
        .map(
          ([muscle, x, y, width, height], index) =>
            `<rect class="muscle muscle-${statusOf(muscle)}" data-index="${index}" x="${x}" y="${y}" width="${width}" height="${height}" rx="6"/>`,
        )
        .join('')}
    </svg>`,
  );
  figure.append(h('figcaption', {}, label));
  figure.querySelectorAll<SVGRectElement>('.muscle').forEach((shape) => {
    shape.addEventListener('click', () => onPick(shapes[Number(shape.dataset.index)][0]));
  });
  return figure;
}

export async function renderVolumeView(root: HTMLElement): Promise<void> {
  const workouts = await getFinishedWorkouts();
  const exercises = await db.exercises.toArray();
  const norms = await getNorms();
  const today = todayLocal();
  const thisWeek = weekStart(today);
  const lastWeek = shiftDays(thisWeek, -7);
  const maxRatio = Number(await getSetting('balanceRatio')) || 3;

  // «Всё время» — среднее по всем прошедшим неделям, начиная с недели первой тренировки
  const firstWeek = weekStart(workouts[workouts.length - 1]?.date ?? today);
  const allWeeks = Math.max(1, Math.round((Date.parse(lastWeek) - Date.parse(firstWeek)) / (7 * 86_400_000)) + 1);
  const spans: Record<Span, { from: string; volume: () => Volume }> = {
    current: { from: thisWeek, volume: () => muscleVolume(workouts, exercises, ...week(thisWeek)) },
    previous: { from: lastWeek, volume: () => muscleVolume(workouts, exercises, ...week(lastWeek)) },
    average: { from: shiftDays(lastWeek, -21), volume: () => averageVolume(workouts, exercises, lastWeek, 4) },
    all: { from: firstWeek, volume: () => averageVolume(workouts, exercises, lastWeek, allWeeks) },
  };
  const span = spans[shownSpan];
  const to = shownSpan === 'current' ? today : shiftDays(lastWeek, 6);
  const volume = span.volume();
  const balance = upperLowerBalance(workouts, today, 28, maxRatio);
  const moves = pushPull(workouts, exercises, ...week(thisWeek));
  const detail = h('p', { className: 'hint' }, t('volume.tapMuscle'));
  const round = (value: number): string => String(Math.round(value * 10) / 10);

  const statusOf = (muscle: Muscle): string => volumeStatus(volume[muscle], norms[muscle]);

  function pick(muscle: Muscle): void {
    const names = exercises
      .filter(
        (exercise) => exercise.primaryMuscle === muscle || exercise.secondaryMuscles?.includes(muscle),
      )
      .filter((exercise) =>
        workouts.some(
          (workout) => workout.date >= span.from && workout.date <= to && workout.exerciseIds.includes(exercise.id),
        ),
      )
      .map((exercise) => exercise.name);
    detail.textContent = t('volume.detail', {
      muscle: t(`muscle.${muscle}`),
      sets: round(volume[muscle]),
      min: norms[muscle][0],
      max: norms[muscle][1],
      exercises: names.join(', ') || t('volume.noExercises'),
    });
  }

  // Полоска до верхней границы нормы, цвет как на карте тела
  const rows = MUSCLES.map((muscle) => {
    const fill = h('div', { className: `volume-fill volume-${statusOf(muscle)}` });
    fill.style.width = `${Math.min(100, (volume[muscle] / norms[muscle][1]) * 100)}%`;
    return h(
      'div',
      { className: 'volume-row' },
      h('span', {}, t(`muscle.${muscle}`)),
      h('strong', {}, t('volume.row', { sets: round(volume[muscle]), min: norms[muscle][0], max: norms[muscle][1] })),
      h('div', { className: 'volume-bar' }, fill),
    );
  });

  root.replaceChildren(
    radioChips<Span>(
      'volume-span',
      t('volume.span'),
      [
        ['current', t('volume.current')],
        ['previous', t('volume.previous')],
        ['average', t('volume.average')],
        ['all', t('volume.all')],
      ],
      shownSpan,
      (value) => {
        shownSpan = value;
        void renderVolumeView(root);
      },
    ),
    h(
      'div',
      { className: 'body-map' },
      bodyFigure(FRONT, t('volume.front'), statusOf, pick),
      bodyFigure(BACK, t('volume.back'), statusOf, pick),
    ),
    h(
      'p',
      { className: 'legend' },
      ...(['none', 'low', 'ok', 'high'] as const).map((status) =>
        h('span', { className: `legend-item legend-${status}` }, t(`volume.${status}`)),
      ),
    ),
    detail,
    h('h2', {}, t('volume.balance')),
    h('p', { className: 'set-row' }, t('volume.upperLower'), h('strong', {}, `${balance.upper} : ${balance.lower}`)),
    ...(balance.warning ? [h('p', { className: 'error' }, t(`volume.warn.${balance.warning}`))] : []),
    h('p', { className: 'set-row' }, t('volume.pushPull'), h('strong', {}, `${moves.push} : ${moves.pull}`)),
    h('h2', {}, t('volume.title')),
    h('p', { className: 'hint' }, t(shownSpan === 'average' || shownSpan === 'all' ? 'volume.perWeekAverage' : 'volume.perWeek')),
    ...rows,
  );
}
