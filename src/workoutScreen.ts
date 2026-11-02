import { guessMuscleGroup, MUSCLE_GROUPS } from './catalog';
import { formatDate } from './dates';
import {
  db,
  findOrCreateExercise,
  type Exercise,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from './db';
import { field, h } from './dom';
import {
  addExerciseToWorkout,
  addSet,
  defaultSet,
  finishWorkout,
  getActiveWorkout,
  getLastPerformance,
  isExactMatch,
  type LastPerformance,
  parseDuration,
  parseSet,
  removeExercise,
  removeSet,
  replaceExercise,
  searchOptions,
  setMuscleGroup,
  stepValue,
  updateSet,
  WORKOUT_TYPE_NAMES,
} from './workouts';

const NO_GROUP = 'Без группы';

function stepper(input: HTMLInputElement, step: number, min: number, max?: number): HTMLElement {
  const stepButton = (label: string, name: string, delta: number): HTMLButtonElement =>
    h(
      'button',
      {
        type: 'button',
        className: 'step-button',
        ariaLabel: name,
        onclick: () => {
          input.value = stepValue(input.value, delta, min, max);
        },
      },
      label,
    );

  return h(
    'div',
    { className: 'stepper' },
    stepButton('−', 'Уменьшить', -step),
    input,
    stepButton('+', 'Увеличить', step),
  );
}

function digitsInput(): HTMLInputElement {
  const input = h('input', { type: 'text', inputMode: 'numeric', autocomplete: 'off', maxLength: 2 });
  input.oninput = () => {
    input.value = input.value.replace(/\D/g, '');
  };
  return input;
}

function formatSet(set: WorkoutSet): string {
  const marks = [set.warmup ? 'разминка' : '', set.toFailure ? 'в отказ' : ''].filter(Boolean);
  return `${set.weight} × ${set.reps}${marks.length > 0 ? ` (${marks.join(', ')})` : ''}`;
}

function groupSelect(value?: string): HTMLSelectElement {
  const groups = value && !MUSCLE_GROUPS.includes(value) ? [...MUSCLE_GROUPS, value] : MUSCLE_GROUPS;
  const select = h(
    'select',
    {},
    h('option', { value: '' }, NO_GROUP),
    ...groups.map((group) => h('option', { value: group }, group)),
  );
  select.value = value ?? '';
  return select;
}

export async function renderWorkoutScreen(
  root: HTMLElement,
  startedWorkout: Workout,
  onClosed: (message: string) => void,
): Promise<void> {
  let workout = startedWorkout;
  let currentId = workout.exercises.at(-1)?.exerciseId;
  // Номер подхода текущего упражнения, который сейчас исправляется
  let editedIndex: number | undefined;

  async function reload(): Promise<void> {
    editedIndex = undefined;
    workout = (await getActiveWorkout()) ?? workout;
    if (!workout.exercises.some((item) => item.exerciseId === currentId)) {
      currentId = workout.exercises.at(-1)?.exerciseId;
    }
    await showWorkout();
  }

  function setForm(
    item: WorkoutExercise,
    exercise: Exercise,
    last?: LastPerformance,
  ): HTMLFormElement {
    const index = editedIndex;
    const edited = index === undefined ? undefined : item.sets[index];
    const filled = edited ?? defaultSet(item.sets, last?.sets);

    const weight = h('input', {
      type: 'text',
      inputMode: 'decimal',
      autocomplete: 'off',
      value: filled ? String(filled.weight) : '',
    });
    const reps = h('input', {
      type: 'text',
      inputMode: 'numeric',
      autocomplete: 'off',
      value: filled ? String(filled.reps) : '',
    });
    const warmup = h('input', { type: 'checkbox', checked: edited?.warmup ?? false });
    const toFailure = h('input', { type: 'checkbox', checked: edited?.toFailure ?? false });
    const error = h('p', { className: 'error', role: 'alert' });

    return h(
      'form',
      {
        className: 'set-form',
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            const set = parseSet(weight.value, reps.value, warmup.checked, toFailure.checked);
            if (index === undefined) {
              await addSet(workout, exercise.id, set);
            } else {
              await updateSet(workout, exercise.id, index, set);
            }
            await reload();
          } catch (problem) {
            error.textContent = problem instanceof Error ? problem.message : 'Не удалось сохранить';
          }
        },
      },
      h(
        'div',
        { className: 'set-inputs' },
        field('Вес, кг', stepper(weight, 0.5, 0)),
        field('Повторения', stepper(reps, 1, 1)),
      ),
      h(
        'div',
        { className: 'checkboxes' },
        h('label', { className: 'checkbox' }, warmup, 'Разминочный'),
        h('label', { className: 'checkbox' }, toFailure, 'В отказ'),
      ),
      error,
      h(
        'button',
        { type: 'submit', className: 'button' },
        index === undefined ? 'Записать подход' : 'Сохранить изменения',
      ),
      ...(index === undefined
        ? []
        : [
            h(
              'button',
              {
                type: 'button',
                className: 'button button-secondary',
                onclick: () => void reload(),
              },
              'Отмена',
            ),
          ]),
    );
  }

  function lastTimeBlock(last?: LastPerformance): HTMLElement {
    return h(
      'section',
      { className: 'last-time' },
      h('h2', {}, last ? `В прошлый раз, ${formatDate(last.date)}` : 'В прошлый раз'),
      last
        ? h('ul', {}, ...last.sets.map((set) => h('li', {}, formatSet(set))))
        : h('p', {}, 'Записей ещё нет'),
    );
  }

  function exerciseCard(
    item: WorkoutExercise,
    exercise: Exercise,
    last?: LastPerformance,
  ): HTMLElement {
    const isCurrent = item.exerciseId === currentId;

    const group = groupSelect(exercise.muscleGroup);
    group.onchange = async () => {
      await setMuscleGroup(exercise.id, group.value || undefined);
      await reload();
    };

    const rows = item.sets.map((set, index) =>
      h(
        'li',
        { className: isCurrent && index === editedIndex ? 'set-row set-row-edited' : 'set-row' },
        h(
          'button',
          {
            type: 'button',
            className: 'set-text',
            ariaLabel: `Исправить подход ${formatSet(set)}`,
            onclick: () => {
              currentId = item.exerciseId;
              editedIndex = index;
              void showWorkout();
            },
          },
          formatSet(set),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'remove-button',
            ariaLabel: 'Удалить подход',
            onclick: async () => {
              await removeSet(workout, item.exerciseId, index);
              await reload();
            },
          },
          '✕',
        ),
      ),
    );

    const actions = h(
      'div',
      { className: 'card-actions' },
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: () => void showAddExercise(item.exerciseId),
        },
        'Заменить',
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: async () => {
            const question = `Удалить «${exercise.name}» из тренировки вместе с подходами?`;
            if (item.sets.length === 0 || confirm(question)) {
              await removeExercise(workout, item.exerciseId);
              await reload();
            }
          },
        },
        'Удалить',
      ),
    );

    return h(
      'article',
      { className: isCurrent ? 'card card-current' : 'card' },
      h(
        'button',
        {
          type: 'button',
          className: 'card-title',
          onclick: () => {
            currentId = item.exerciseId;
            editedIndex = undefined;
            void showWorkout();
          },
        },
        exercise.name,
        h('span', { className: 'muscle-group' }, exercise.muscleGroup ?? ''),
      ),
      ...(isCurrent ? [lastTimeBlock(last)] : []),
      h('ol', { className: 'set-list' }, ...rows),
      ...(isCurrent ? [setForm(item, exercise, last), field('Группа мышц', group), actions] : []),
    );
  }

  async function showWorkout(): Promise<void> {
    const exercises = await db.exercises.bulkGet(workout.exercises.map((item) => item.exerciseId));
    const last = currentId === undefined ? undefined : await getLastPerformance(currentId, workout);
    const cards = workout.exercises.flatMap((item, index) => {
      const exercise = exercises[index];
      return exercise ? [exerciseCard(item, exercise, last)] : [];
    });

    root.replaceChildren(
      h('h1', {}, `${WORKOUT_TYPE_NAMES[workout.type]}, ${formatDate(workout.date)}`),
      ...cards,
      h(
        'button',
        { type: 'button', className: 'button', onclick: () => void showAddExercise() },
        'Добавить упражнение',
      ),
      h(
        'button',
        { type: 'button', className: 'button button-secondary', onclick: showFinish },
        'Завершить тренировку',
      ),
    );
  }

  async function showAddExercise(replacedId?: number): Promise<void> {
    async function choose(exercise: Exercise): Promise<void> {
      if (replacedId === undefined) {
        await addExerciseToWorkout(workout, exercise.id);
      } else {
        await replaceExercise(workout, replacedId, exercise.id);
      }
      currentId = exercise.id;
      await reload();
    }

    const nameInput = h('input', { type: 'text', autocomplete: 'off' });
    const groupInput = groupSelect();
    let groupChanged = false;
    groupInput.onchange = () => {
      groupChanged = true;
    };

    const results = h('div', { hidden: true });
    nameInput.onfocus = () => {
      results.hidden = false;
    };

    let selectedGroup = '';
    const groupFilter = h(
      'div',
      { className: 'chips', role: 'radiogroup', ariaLabel: 'Группа мышц' },
      ...[['Все', ''], ...MUSCLE_GROUPS.map((group) => [group, group])].map(([label, value]) =>
        h(
          'label',
          { className: 'chip' },
          h('input', {
            type: 'radio',
            name: 'group-filter',
            checked: value === '',
            // click, а не change: «Все» выбрано сразу, но нажатие на него тоже открывает список
            onclick: () => {
              selectedGroup = value;
              results.hidden = false;
              void updateResults();
            },
          }),
          label,
        ),
      ),
    );

    const newExercise = h(
      'form',
      {
        hidden: true,
        onsubmit: async (event: Event) => {
          event.preventDefault();
          await choose(await findOrCreateExercise(nameInput.value, groupInput.value || undefined));
        },
      },
      field('Группа мышц', groupInput),
      h('button', { type: 'submit', className: 'button' }, 'Создать упражнение'),
    );

    async function updateResults(): Promise<void> {
      const name = nameInput.value.trim();
      const found = await searchOptions(name);
      const shown = selectedGroup
        ? found.filter((option) => option.muscleGroup === selectedGroup)
        : found;

      const items: HTMLElement[] = [];
      let lastGroup: string | undefined;
      for (const option of shown) {
        const group = option.muscleGroup ?? NO_GROUP;
        if (group !== lastGroup) {
          items.push(h('h2', { className: 'group-heading' }, group));
          lastGroup = group;
        }
        items.push(
          h(
            'button',
            {
              type: 'button',
              className: 'list-button',
              onclick: async () => {
                await choose(await findOrCreateExercise(option.name, option.muscleGroup));
              },
            },
            option.name,
          ),
        );
      }
      results.replaceChildren(...items);

      newExercise.hidden = name === '' || isExactMatch(found, name);
      if (!groupChanged) {
        groupInput.value = guessMuscleGroup(name) ?? '';
      }
    }

    nameInput.oninput = () => void updateResults();

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, replacedId === undefined ? 'Добавить упражнение' : 'Заменить упражнение'),
        field('Название', nameInput),
        groupFilter,
        newExercise,
        results,
        h(
          'button',
          {
            type: 'button',
            className: 'button button-secondary bottom-action',
            onclick: () => void showWorkout(),
          },
          'Назад',
        ),
      ),
    );
    await updateResults();
  }

  function showFinish(): void {
    const hours = digitsInput();
    const minutes = digitsInput();
    const note = h('textarea', { rows: 3 });
    let rating: number | undefined;
    const ratingButtons = Array.from({ length: 10 }, (_, index) =>
      h(
        'label',
        { className: 'chip' },
        h('input', {
          type: 'radio',
          name: 'rating',
          onclick: () => {
            rating = index + 1;
          },
        }),
        String(index + 1),
      ),
    );
    const error = h('p', { className: 'error', role: 'alert' });
    const isEmpty = workout.exercises.every((item) => item.sets.length === 0);

    root.replaceChildren(
      h('h1', {}, 'Завершение'),
      ...(isEmpty ? [h('p', { className: 'hint' }, 'В тренировке нет подходов, она не сохранится.')] : []),
      h(
        'form',
        {
          onsubmit: async (event: Event) => {
            event.preventDefault();
            try {
              const saved = await finishWorkout(workout, {
                durationMin: parseDuration(hours.value, minutes.value),
                rating,
                note: note.value.trim() || undefined,
              });
              onClosed(saved ? 'Тренировка сохранена' : 'Пустая тренировка удалена');
            } catch (problem) {
              error.textContent = problem instanceof Error ? problem.message : 'Не удалось сохранить';
            }
          },
        },
        h(
          'div',
          { className: 'set-inputs' },
          field('Часы', stepper(hours, 1, 0)),
          field('Минуты', stepper(minutes, 5, 0, 59)),
        ),
        h(
          'div',
          { className: 'field' },
          h('span', {}, 'Оценка тренировки'),
          h('div', { className: 'rating', role: 'radiogroup', ariaLabel: 'Оценка' }, ...ratingButtons),
        ),
        field('Заметка', note),
        error,
        h('button', { type: 'submit', className: 'button' }, 'Завершить'),
        h(
          'button',
          { type: 'button', className: 'button button-secondary', onclick: () => void showWorkout() },
          'Назад',
        ),
      ),
    );
  }

  await showWorkout();
}
