import { todayLocal } from './dates';
import { db } from './db';
import { h } from './dom';
import { t } from './i18n';
import { MUSCLES, type Muscle } from './muscles';
import { getSetting } from './settings';
import { radioChips, segmented } from './ui';
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

// Силуэт рисуется в рамке 120 × 240. Парные части заданы для левой половины
// и отражаются на правую, поэтому фигура всегда симметрична.
const MIRROR = 'matrix(-1 0 0 1 120 0)';

// Атлетичное телосложение: широкие плечи, узкая талия, мощные бедра
const BODY_CENTER = [
  'M60 4 C67 4 72 9 72 17 C72 25 67 30 60 30 C53 30 48 25 48 17 C48 9 53 4 60 4 Z',
  'M52 25 L68 25 L71 37 L49 37 Z',
  'M60 34 C72 34 86 36 94 41 C99 44 100 50 98 56 L92 70 C88 80 82 90 79 100 C78 108 80 114 82 122 L38 122 C40 114 42 108 41 100 C38 90 32 80 28 70 L22 56 C20 50 21 44 26 41 C34 36 48 34 60 34 Z',
];

const BODY_SIDE = [
  // Плечо и рука
  'M25 44 C17 46 12 54 11 64 L9 90 C9 97 13 100 18 99 C22 98 25 94 26 88 L31 64 Z',
  'M10 99 C6 104 4 110 3 118 L2 132 C2 137 6 139 10 138 C13 137 15 134 15 130 L20 102 Z',
  'M3 139 C0 142 0 150 4 152 C8 153 11 150 11 145 L10 139 Z',
  // Нога
  'M37 118 L59 118 L59 128 C59 146 58 160 56 174 C52 179 44 179 41 174 C35 160 33 140 37 118 Z',
  'M41 176 L56 176 C58 186 57 196 55 210 C54 218 53 222 52 224 L46 224 C44 218 41 206 40 194 C39 186 40 180 41 176 Z',
  'M45 224 L54 224 C57 230 57 234 53 236 L42 236 C39 234 40 228 45 224 Z',
];

// [мышца, контур, есть ли пара на правой стороне]
type Shape = [Muscle, string, boolean];

const FRONT: Shape[] = [
  ['chest', 'M40 44 C48 40 56 41 59 43 L59 62 C52 67 44 66 37 61 C33 56 34 48 40 44 Z', true],
  ['frontDelt', 'M28 44 C33 40 39 41 41 44 C37 50 34 56 30 61 C25 57 25 49 28 44 Z', true],
  ['sideDelt', 'M21 48 C22 44 25 42 28 43 C26 50 25 56 24 63 C20 59 19 53 21 48 Z', true],
  ['biceps', 'M16 63 C20 58 26 59 27 64 L24 87 C22 93 15 93 14 88 Z', true],
  ['forearms', 'M9 103 C13 99 18 100 19 104 L14 129 C12 133 7 132 6 128 Z', true],
  ['abs', 'M51 67 C56 65 64 65 69 67 L69 108 C65 113 55 113 51 108 Z', false],
  ['quads', 'M39 126 C46 120 54 121 58 127 C59 146 57 160 54 170 C50 175 45 174 42 170 C36 156 35 140 39 126 Z', true],
  ['calves', 'M42 182 C46 177 52 177 55 182 C56 194 55 204 52 214 C50 217 46 216 45 212 C41 202 40 190 42 182 Z', true],
];

const BACK: Shape[] = [
  ['traps', 'M50 30 L70 30 C74 35 82 39 90 41 C78 46 67 53 60 62 C53 53 42 46 30 41 C38 39 46 35 50 30 Z', false],
  ['rearDelt', 'M25 45 C30 40 37 40 40 43 C36 50 33 56 28 61 C23 57 22 50 25 45 Z', true],
  ['lats', 'M36 50 C45 53 53 60 58 68 L58 96 C52 98 46 96 43 92 C38 82 31 70 28 60 C30 55 32 51 36 50 Z', true],
  ['triceps', 'M15 63 C19 58 25 59 27 64 L25 88 C23 93 15 93 14 88 Z', true],
  ['forearms', 'M9 103 C13 99 18 100 19 104 L14 129 C12 133 7 132 6 128 Z', true],
  ['glutes', 'M41 104 C48 100 55 101 59 106 L59 124 C52 130 44 129 40 124 C37 117 38 110 41 104 Z', true],
  ['hamstrings', 'M39 130 C46 127 54 127 58 131 C58 150 56 162 54 170 C50 175 45 174 42 170 C37 158 36 144 39 130 Z', true],
  ['calves', 'M41 180 C46 174 53 175 56 181 C58 194 56 204 52 212 C49 215 45 214 44 210 C39 200 38 189 41 180 Z', true],
];

function bodyFigure(
  shapes: Shape[],
  label: string,
  statusOf: (muscle: Muscle) => string,
  onPick: (muscle: Muscle) => void,
): HTMLElement {
  const base = (d: string): string => `<path class="body-base" d="${d}"/>`;
  const muscle = ([name, d]: Shape, index: number): string =>
    `<path class="muscle muscle-${statusOf(name)}" data-index="${index}" d="${d}"/>`;
  const figure = h('figure', { className: 'body-figure' });
  figure.insertAdjacentHTML(
    'beforeend',
    `<svg viewBox="0 0 120 240" role="img" aria-label="${label}">
      ${BODY_CENTER.map(base).join('')}
      ${BODY_SIDE.map(base).join('')}
      <g transform="${MIRROR}">${BODY_SIDE.map(base).join('')}</g>
      ${shapes.map(muscle).join('')}
      <g transform="${MIRROR}">${shapes.map((shape, index) => (shape[2] ? muscle(shape, index) : '')).join('')}</g>
    </svg>`,
  );
  figure.append(h('figcaption', {}, label));
  figure.querySelectorAll<SVGPathElement>('.muscle').forEach((shape) => {
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

  // «Все время» — среднее по всем прошедшим неделям, начиная с недели первой тренировки
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
    segmented(radioChips<Span>(
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
    )),
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
