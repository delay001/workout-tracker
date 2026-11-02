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

export async function renderExerciseSettings(root: HTMLElement, onBack: () => void): Promise<void> {
  function backButton(onclick: () => void): HTMLButtonElement {
    return h(
      'button',
      { type: 'button', className: 'button button-secondary bottom-action', onclick },
      'Назад',
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
        throw new Error('Такое упражнение уже есть');
      } else {
        await findOrCreateExercise(name.value, muscleGroup);
      }
    }

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, option ? 'Изменить упражнение' : 'Новое упражнение'),
        h(
          'form',
          {
            onsubmit: async (event: Event) => {
              event.preventDefault();
              try {
                await save();
                await showList();
              } catch (problem) {
                error.textContent = problem instanceof Error ? problem.message : 'Не удалось сохранить';
              }
            },
          },
          field('Название', name),
          field('Группа мышц', group),
          error,
          h('button', { type: 'submit', className: 'button' }, 'Сохранить'),
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
                'Скрыть из каталога',
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
        const group = option.muscleGroup ?? 'Без группы';
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
        items.push(h('h2', { className: 'group-heading' }, 'Скрытые, нажми, чтобы вернуть'));
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
        h('h1', {}, 'Упражнения'),
        h('button', { type: 'button', className: 'button', onclick: () => showEdit() }, '+ Новое упражнение'),
        field('Поиск', search),
        results,
        backButton(onBack),
      ),
    );
    await updateResults();
  }

  await showList();
}
