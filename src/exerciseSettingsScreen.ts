import { findOrCreateExercise } from './db';
import { field, h } from './dom';
import { groupSelect } from './workoutScreen';
import {
  getHiddenExercises,
  isExactMatch,
  searchOptions,
  setExerciseHidden,
  updateExercise,
  type ExerciseOption,
} from './workouts';
import { t } from './i18n';

export async function renderExerciseSettings(root: HTMLElement, onBack: () => void): Promise<void> {
  function backButton(onclick: () => void): HTMLButtonElement {
    return h(
      'button',
      { type: 'button', className: 'button button-secondary bottom-action', onclick },
      t('common.back'),
    );
  }

  function showEdit(option?: ExerciseOption): void {
    const name = h('input', { type: 'text', autocomplete: 'off', value: option?.name ?? '' });
    const group = groupSelect(option?.muscleGroup);
    const error = h('p', { className: 'error', role: 'alert' });

    async function save(): Promise<void> {
      const muscleGroup = group.value || undefined;
      if (option) {
        await updateExercise(await findOrCreateExercise(option.name, option.muscleGroup), name.value, muscleGroup);
      } else if (isExactMatch(await searchOptions(name.value), name.value)) {
        throw new Error(t('exercise.exists'));
      } else {
        await findOrCreateExercise(name.value, muscleGroup);
      }
    }

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, option ? t('exercise.edit') : t('exercise.new')),
        h(
          'form',
          {
            onsubmit: async (event: Event) => {
              event.preventDefault();
              try {
                await save();
                await showList();
              } catch (problem) {
                error.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
              }
            },
          },
          field(t('common.name'), name),
          field(t('common.muscleGroup'), group),
          error,
          h('button', { type: 'submit', className: 'button' }, t('common.save')),
        ),
        ...(option
          ? [
              h(
                'button',
                {
                  type: 'button',
                  className: 'button button-secondary',
                  onclick: async () => {
                    const exercise = await findOrCreateExercise(option.name, option.muscleGroup);
                    await setExerciseHidden(exercise.id, true);
                    await showList();
                  },
                },
                t('exercise.hide'),
              ),
            ]
          : []),
        backButton(() => void showList()),
      ),
    );
  }

  async function showList(): Promise<void> {
    const search = h('input', { type: 'text', autocomplete: 'off' });
    const results = h('div');

    async function updateResults(): Promise<void> {
      const options = await searchOptions(search.value);
      const hidden = await getHiddenExercises();

      const items: HTMLElement[] = [];
      let lastGroup: string | undefined;
      for (const option of options) {
        const group = option.muscleGroup ?? t('common.noGroup');
        if (group !== lastGroup) {
          items.push(h('h2', { className: 'group-heading' }, group));
          lastGroup = group;
        }
        items.push(
          h(
            'button',
            { type: 'button', className: 'list-button', onclick: () => showEdit(option) },
            option.name,
          ),
        );
      }

      if (hidden.length > 0) {
        items.push(h('h2', { className: 'group-heading' }, t('exercise.hiddenList')));
      }
      for (const exercise of hidden) {
        items.push(
          h(
            'button',
            {
              type: 'button',
              className: 'list-button',
              onclick: async () => {
                await setExerciseHidden(exercise.id, false);
                await updateResults();
              },
            },
            exercise.name,
          ),
        );
      }
      results.replaceChildren(...items);
    }

    search.oninput = () => void updateResults();

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, t('common.exercises')),
        h('button', { type: 'button', className: 'button', onclick: () => showEdit() }, t('exercise.addNew')),
        field(t('common.search'), search),
        results,
        backButton(onBack),
      ),
    );
    await updateResults();
  }

  await showList();
}
