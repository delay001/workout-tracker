import { db, findOrCreateExercise } from './db';
import { guessMuscleGroup } from './catalog';
import { markupFor, MUSCLES, type Movement, type Muscle } from './muscles';
import { select } from './ui';
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

function backButton(onclick: () => void): HTMLButtonElement {
  return h(
    'button',
    { type: 'button', className: 'button button-secondary bottom-action', onclick },
    t('common.back'),
  );
}

// Окно создания или правки упражнения. Им же пользуется тренировка, когда нужного упражнения нет в каталоге.
export async function renderExerciseForm(
  root: HTMLElement,
  option: ExerciseOption | undefined,
  onSaved: (name: string) => void | Promise<void>,
  onBack: () => void,
  newName = '',
): Promise<void> {
  {
    const startName = option?.name ?? newName;
    const name = h('input', { type: 'text', autocomplete: 'off', value: startName });
    const group = groupSelect(option ? option.muscleGroup : guessMuscleGroup(startName));
    const error = h('p', { className: 'error', role: 'alert' });
    const saved = option && (await db.exercises.where('nameKey').equals(option.name.toLowerCase()).first());
    const markup = saved ?? { ...markupFor(startName), id: 0 };
    const primary = select(
      [['', t('exercise.noPrimary')], ...MUSCLES.map((muscle): [string, string] => [muscle, t(`muscle.${muscle}`)])],
      markup.primaryMuscle ?? '',
      () => undefined,
    );
    const movement = select(
      (['push', 'pull', 'other'] as const).map((value): [string, string] => [value, t(`movement.${value}`)]),
      markup.movement ?? 'other',
      () => undefined,
    );
    const secondary = MUSCLES.map((muscle) => {
      const box = h('input', { type: 'checkbox', checked: markup.secondaryMuscles?.includes(muscle) ?? false });
      box.onchange = () => {
        if (secondary.filter(([, item]) => item.checked).length > 3) {
          box.checked = false;
        }
      };
      return [muscle, box] as const;
    });

    async function saveMarkup(name: string): Promise<void> {
      const row = await findOrCreateExercise(name);
      await db.exercises.update(row.id, {
        primaryMuscle: primary.value ? (primary.value as Muscle) : undefined,
        secondaryMuscles: secondary.filter(([, box]) => box.checked).map(([muscle]) => muscle),
        movement: movement.value as Movement,
      });
    }

    async function save(): Promise<void> {
      const muscleGroup = group.value || undefined;
      if (option) {
        await updateExercise(await findOrCreateExercise(option.name, option.muscleGroup), name.value, muscleGroup);
      } else if (isExactMatch(await searchOptions(name.value), name.value)) {
        throw new Error(t('exercise.exists'));
      } else {
        await findOrCreateExercise(name.value, muscleGroup);
      }
      await saveMarkup(name.value);
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
                await onSaved(name.value.trim());
              } catch (problem) {
                error.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
              }
            },
          },
          field(t('common.name'), name, true),
          field(t('common.muscleGroup'), group),
          h('h2', {}, t('exercise.markup')),
          field(t('exercise.primary'), primary),
          field(t('exercise.movement'), movement),
          h(
            'div',
            { className: 'field' },
            h('span', {}, t('exercise.secondary')),
            h(
              'div',
              { className: 'checkboxes' },
              ...secondary.map(([muscle, box]) => h('label', { className: 'checkbox' }, box, t(`muscle.${muscle}`))),
            ),
          ),
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
                    onBack();
                  },
                },
                t('exercise.hide'),
              ),
            ]
          : []),
        backButton(onBack),
      ),
    );
  }
}

export async function renderExerciseSettings(root: HTMLElement, onBack: () => void): Promise<void> {
  const showEdit = (option?: ExerciseOption): void =>
    void renderExerciseForm(root, option, () => showList(), () => void showList());

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
