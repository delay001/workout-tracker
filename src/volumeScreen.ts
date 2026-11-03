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

const BODY_CENTER = [
  'M60 3 C68 3 73 9 73 17 C73 26 67 31 60 31 C53 31 47 26 47 17 C47 9 52 3 60 3 Z',
  'M53 28 L67 28 L68 38 L52 38 Z',
  'M60 36 C70 36 82 37 88 42 C93 46 93 52 92 58 L87 90 C86 102 84 112 82 122 L38 122 C36 112 34 102 33 90 L28 58 C27 52 27 46 32 42 C38 37 50 36 60 36 Z',
];

const BODY_SIDE = [
  // Плечо и рука
  'M30 44 C22 46 18 52 17 62 L13 92 C12 98 16 101 21 100 C25 99 27 96 28 90 L33 62 Z',
  'M14 100 C10 104 9 110 8 118 L6 132 C6 137 10 139 14 138 C17 137 19 134 19 130 L24 102 Z',
  'M7 139 C4 142 4 150 8 152 C12 153 15 150 15 145 L14 139 Z',
  // Нога
  'M38 118 L60 118 L60 128 C59 148 57 162 55 174 C52 178 45 178 42 174 C38 160 36 142 38 118 Z',
  'M42 176 L55 176 C57 192 56 206 53 222 C51 225 46 225 45 222 C41 206 40 192 42 176 Z',
  'M44 222 L54 222 C57 228 57 233 53 235 L42 235 C39 233 40 227 44 222 Z',
];

// [мышца, контур, есть ли пара на правой стороне]
type Shape = [Muscle, string, boolean];

const FRONT: Shape[] = [
  ['chest', 'M42 46 C49 42 56 43 59 45 L59 62 C52 66 45 65 40 60 C37 55 38 49 42 46 Z', true],
  ['frontDelt', 'M33 45 C37 41 42 42 43 45 C40 50 37 55 34 59 C30 55 30 49 33 45 Z', true],
  ['sideDelt', 'M28 48 C29 45 31 44 33 45 C31 51 30 56 29 61 C26 57 26 52 28 48 Z', true],
  ['biceps', 'M23 62 C26 58 30 59 31 63 L28 87 C26 92 21 92 20 88 Z', true],
  ['forearms', 'M16 103 C19 99 23 100 24 104 L19 129 C17 133 12 132 12 128 Z', true],
  ['abs', 'M50 67 C55 65 65 65 70 67 L70 104 C66 110 54 110 50 104 Z', false],
  ['quads', 'M41 126 C47 121 54 122 58 127 C58 148 56 160 53 169 C49 173 45 172 43 168 C39 154 38 140 41 126 Z', true],
  ['calves', 'M43 181 C46 177 51 177 53 181 C54 194 53 203 50 213 C48 216 45 215 44 211 C41 200 41 190 43 181 Z', true],
];

const BACK: Shape[] = [
  ['traps', 'M50 33 L70 33 C74 37 79 40 84 42 C74 46 66 52 60 60 C54 52 46 46 36 42 C41 40 46 37 50 33 Z', false],
  ['rearDelt', 'M31 46 C35 41 41 41 43 44 C40 50 37 55 33 59 C29 55 29 50 31 46 Z', true],
  ['lats', 'M38 52 C46 54 53 60 58 66 L58 92 C50 93 43 89 39 82 C35 72 35 60 38 52 Z', true],
  ['triceps', 'M22 62 C25 58 30 59 31 63 L29 88 C27 92 21 92 20 88 Z', true],
  ['forearms', 'M16 103 C19 99 23 100 24 104 L19 129 C17 133 12 132 12 128 Z', true],
  ['glutes', 'M40 104 C47 100 55 101 59 106 L59 124 C52 130 45 129 41 124 C37 117 37 110 40 104 Z', true],
  ['hamstrings', 'M41 130 C47 127 54 127 58 131 C58 150 56 160 53 169 C49 173 45 172 43 168 C39 156 38 142 41 130 Z', true],
  ['calves', 'M42 178 C46 173 52 174 54 179 C56 193 55 202 51 210 C48 213 45 212 43 208 C39 197 39 187 42 178 Z', true],
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
