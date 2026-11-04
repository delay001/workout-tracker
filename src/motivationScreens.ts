import { exerciseLabel } from './catalog';
import {
  ACHIEVEMENTS,
  evaluateAchievements,
  newAchievements,
  type AchievementState,
} from './achievements';
import { getBodyWeights, getGoalHistory, getWeightGoal, type WeightGoal } from './bodyWeight';
import { formatMonth, todayLocal } from './dates';
import { db } from './db';
import { h, showToast } from './dom';
import { t, type MessageKey } from './i18n';
import { getMonthlyGoal, getSetting, setSetting } from './settings';
import { select } from './ui';
import { formatWeight } from './units';
import { getFinishedWorkouts } from './workouts';
import { availableYears, yearSummary, type YearSummary } from './yearSummary';

function goalReached(goal: WeightGoal, currentKg: number): boolean {
  return goal.targetKg < goal.startKg ? currentKg <= goal.targetKg : currentKg >= goal.targetKg;
}

export async function currentStates(): Promise<AchievementState[]> {
  const workouts = await getFinishedWorkouts();
  const current = (await getBodyWeights()).at(-1)?.kg;
  const active = await getWeightGoal();
  const goals = [...(await getGoalHistory()), ...(active ? [active] : [])];
  const reached = current !== undefined && goals.some((goal) => goalReached(goal, current));
  const exercises = await db.exercises.toArray();
  return evaluateAchievements(workouts, todayLocal(), {
    weightGoalReached: reached,
    monthlyGoal: await getMonthlyGoal(),
    exerciseName: (id) => {
      const name = exercises.find((exercise) => exercise.id === id)?.name;
      return name && exerciseLabel(name);
    },
    weightLostKg: active && current !== undefined ? active.startKg - current : 0,
  });
}

// При первом запуске уже заслуженное просто запоминается, без поздравлений
export async function syncAchievements(notify: boolean): Promise<void> {
  const saved = await getSetting('achievementsSeen');
  const states = await currentStates();
  const seen = saved ? (JSON.parse(saved) as Record<string, number>) : undefined;
  if (seen && notify) {
    const fresh = newAchievements(states, seen)[0];
    if (fresh) {
      showToast(t('achievement.toast', { name: t(`achievement.${fresh.id}` as MessageKey) }));
    }
  }
  if (!seen || notify) {
    await setSetting(
      'achievementsSeen',
      JSON.stringify(Object.fromEntries(states.map((state) => [state.id, state.count]))),
    );
  }
}

export async function renderAchievementsScreen(root: HTMLElement, onBack: () => void): Promise<void> {
  const states = await currentStates();
  const row = (state: AchievementState): HTMLElement =>
    h(
      'article',
      { className: state.count > 0 ? 'card achievement achievement-done' : 'card achievement' },
      h('strong', {}, t(`achievement.${state.id}` as MessageKey)),
      h(
        'span',
        { className: 'muscle-group' },
        state.count > 0
          ? t('achievement.earned', { count: state.count })
          : t('achievement.progress', { value: state.value, target: state.target }),
      ),
    );

  const earned = states.filter((state) => state.count > 0);
  const locked = states.filter((state) => state.count === 0);

  root.replaceChildren(
    h(
      'div',
      { className: 'screen' },
      h('h1', {}, t('achievement.title')),
      h('p', { className: 'hint' }, t('achievement.summary', { earned: earned.length, total: ACHIEVEMENTS.length })),
      ...earned.map(row),
      ...locked.map(row),
      h(
        'button',
        { type: 'button', className: 'button button-secondary bottom-action', onclick: onBack },
        t('common.back'),
      ),
    ),
  );
}

function yearCards(summary: YearSummary): [string, string][] {
  const cards: [string, string][] = [
    [t('year.workouts'), t('year.workoutsValue', { workouts: summary.workouts, hours: summary.hours })],
    [t('year.tonnage'), formatWeight(summary.tonnage)],
    [t('year.balance'), `${summary.upper} : ${summary.lower}`],
    [t('year.records'), String(summary.records)],
  ];
  if (summary.favourite) {
    cards.push([t('year.favourite'), summary.favourite]);
  }
  if (summary.biggestGain) {
    cards.push([t('year.gain'), `${summary.biggestGain.name}: +${formatWeight(summary.biggestGain.kg)}`]);
  }
  if (summary.bestMonth) {
    cards.push([
      t('year.bestMonth'),
      `${formatMonth(summary.year, summary.bestMonth.month)}: ${summary.bestMonth.workouts}`,
    ]);
  }
  if (summary.weightChange !== undefined) {
    cards.push([t('year.weight'), `${summary.weightChange > 0 ? '+' : ''}${formatWeight(summary.weightChange)}`]);
  }
  return cards;
}

// Картинка карточки для сохранения
function saveCard(year: number, title: string, value: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 800;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const gradient = context.createLinearGradient(0, 0, 800, 800);
  gradient.addColorStop(0, '#17151f');
  gradient.addColorStop(1, accent);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 800, 800);
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.font = '600 40px system-ui, sans-serif';
  context.fillText(String(year), 400, 160);
  context.font = '500 44px system-ui, sans-serif';
  context.fillText(title, 400, 340);
  context.font = '700 56px system-ui, sans-serif';
  context.fillText(value, 400, 450, 720);

  canvas.toBlob((blob) => {
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `workout-year-${year}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }
  });
}

export async function renderYearScreen(root: HTMLElement, onBack: () => void): Promise<void> {
  const workouts = await getFinishedWorkouts();
  const exercises = await db.exercises.toArray();
  const weights = await getBodyWeights();
  const allYears = [...new Set(workouts.map((workout) => Number(workout.date.slice(0, 4))))];
  const years = availableYears(allYears, todayLocal());
  const cards = h('div', { className: 'year-cards' });

  function show(year: number): void {
    const summary = yearSummary(workouts, exercises, weights, year);
    cards.replaceChildren(
      ...yearCards(summary).map(([title, value]) =>
        h(
          'article',
          { className: 'year-card' },
          h('p', {}, title),
          h('strong', {}, value),
          h(
            'button',
            {
              type: 'button',
              className: 'button button-secondary',
              onclick: () => saveCard(year, title, value),
            },
            t('year.save'),
          ),
        ),
      ),
    );
  }

  if (years.length > 0) {
    show(years[0]);
  }

  root.replaceChildren(
    h(
      'div',
      { className: 'screen' },
      h('h1', {}, t('year.title')),
      ...(years.length > 0
        ? [
            select(
              years.map((year): [string, string] => [String(year), String(year)]),
              String(years[0]),
              (value) => show(Number(value)),
            ),
            cards,
          ]
        : [h('p', { className: 'hint' }, t('year.none'))]),
      h(
        'button',
        { type: 'button', className: 'button button-secondary bottom-action', onclick: onBack },
        t('common.back'),
      ),
    ),
  );
}
