import { lineChart } from './chart';
import { formatDate } from './dates';
import type { Exercise } from './db';
import { h } from './dom';
import { exerciseProgress } from './stats';
import {
  bestResult,
  formatSet,
  getExerciseHistory,
  getUsedExercises,
  type BestResult,
} from './workouts';
import { t } from './i18n';

function formatBest(best: BestResult): string {
  return t('exercise.bestValue', { weight: best.set.weight, reps: best.set.reps, date: formatDate(best.date) });
}

export async function renderExercisesScreen(root: HTMLElement): Promise<void> {
  async function showList(): Promise<void> {
    const used = await getUsedExercises();

    const items: HTMLElement[] = [];
    let lastGroup: string | undefined;
    for (const { exercise, best } of used) {
      const group = exercise.muscleGroup ?? t('common.noGroup');
      if (group !== lastGroup) {
        items.push(h('h2', { className: 'group-heading' }, group));
        lastGroup = group;
      }
      items.push(
        h(
          'button',
          { type: 'button', className: 'list-button', onclick: () => void showExercise(exercise) },
          exercise.name,
          h('span', { className: 'muscle-group' }, best ? t('exercise.best', { best: formatBest(best) }) : ''),
        ),
      );
    }

    root.replaceChildren(
      ...(used.length === 0
        ? [h('p', { className: 'hint' }, t('exercise.noneYet'))]
        : items),
    );
  }

  async function showExercise(exercise: Exercise): Promise<void> {
    const history = await getExerciseHistory(exercise.id);
    const best = bestResult(history);
    const progress = exerciseProgress(history);

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h2', {}, exercise.name),
        ...(exercise.muscleGroup ? [h('p', { className: 'hint' }, exercise.muscleGroup)] : []),
        ...(best
          ? [
              h(
                'section',
                { className: 'last-time' },
                h('h2', {}, t('exercise.bestResult')),
                h('p', {}, formatBest(best)),
              ),
            ]
          : []),
        ...(progress.length > 1 && progress.some((point) => point.value > 0)
          ? [lineChart(progress, t('unit.kg'), t('exercise.progress', { name: exercise.name }))]
          : []),
        ...history.map((entry) =>
          h(
            'article',
            { className: 'card' },
            h('h2', { className: 'history-date' }, formatDate(entry.date)),
            h('ol', { className: 'set-list' }, ...entry.sets.map((set) => h('li', {}, formatSet(set)))),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'button button-secondary bottom-action',
            onclick: () => void showList(),
          },
          t('common.back'),
        ),
      ),
    );
  }

  await showList();
}
