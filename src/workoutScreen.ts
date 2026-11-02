import { guessMuscleGroup, MUSCLE_GROUPS } from './catalog';
import { formatDate, formatDuration } from './dates';
import {
  db,
  findOrCreateExercise,
  type Exercise,
  type Workout,
  type WorkoutExercise,
} from './db';
import { field, h } from './dom';
import {
  addExerciseToWorkout,
  addSet,
  bestSet,
  deleteWorkout,
  finishWorkout,
  formatSet,
  getLastPerformance,
  getWorkoutTypes,
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
  workoutTypeName,
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

export function groupSelect(value?: string): HTMLSelectElement {
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
  onClosed: () => void,
): Promise<void> {
  let workout = startedWorkout;
  const workoutTypes = await getWorkoutTypes();
  // Завершённая тренировка открыта из истории: изменения в ней сохраняются сразу же
  const isEditing = startedWorkout.status === 'finished';
  let currentId = isEditing ? undefined : workout.exercises.at(-1)?.exerciseId;
  // Номер подхода текущего упражнения, который сейчас исправляется
  let editedIndex: number | undefined;

  async function reload(): Promise<void> {
    editedIndex = undefined;
    workout = (await db.workouts.get(workout.id)) ?? workout;
    if (currentId !== undefined && !workout.exercises.some((item) => item.exerciseId === currentId)) {
      currentId = workout.exercises.at(-1)?.exerciseId;
    }
    await showWorkout();
  }

  function setForm(item: WorkoutExercise, exercise: Exercise): HTMLFormElement {
    const index = editedIndex;
    const edited = index === undefined ? undefined : item.sets[index];
    const filled = edited ?? item.sets.at(-1);

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
    const peak = last && bestSet(last.sets);
    return h(
      'section',
      { className: 'last-time' },
      h('h2', {}, last ? `В прошлый раз, ${formatDate(last.date)}` : 'В прошлый раз'),
      h('p', {}, peak ? `${peak.weight} кг × ${peak.reps}` : 'Записей ещё нет'),
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
      ...(isCurrent ? [setForm(item, exercise), field('Группа мышц', group), actions] : []),
    );
  }

  async function showWorkout(): Promise<void> {
    const exercises = await db.exercises.bulkGet(workout.exercises.map((item) => item.exerciseId));
    const last = currentId === undefined ? undefined : await getLastPerformance(currentId, workout);
    const cards = workout.exercises.flatMap((item, index) => {
      const exercise = exercises[index];
      return exercise ? [exerciseCard(item, exercise, last)] : [];
    });

    const addButton = h(
      'button',
      { type: 'button', className: 'button', onclick: () => void showAddExercise() },
      'Добавить упражнение',
    );

    const backButton = h(
      'button',
      {
        type: 'button',
        className: 'button button-secondary bottom-action',
        // Пустая тренировка при завершении удаляется, поэтому завершённую спрашиваем
        onclick: async () => {
          const hasSets = workout.exercises.some((item) => item.sets.length > 0);
          if (isEditing && !hasSets && !confirm('В тренировке нет подходов, она будет удалена. Продолжить?')) {
            return;
          }
          await finishWorkout(workout, {});
          onClosed();
        },
      },
      'Назад',
    );

    const closeButtons = isEditing
      ? [
          h(
            'button',
            { type: 'button', className: 'button button-secondary', onclick: showFinish },
            'Дата, оценка и заметка',
          ),
          backButton,
        ]
      : workout.exercises.length > 0
        ? [
            h(
              'button',
              { type: 'button', className: 'button button-secondary', onclick: showFinish },
              'Завершить тренировку',
            ),
            // Тренировка остаётся активной, вернуться можно с вкладки «Тренировка»
            h('button', { type: 'button', className: 'button button-secondary', onclick: onClosed }, 'Назад'),
          ]
        : [backButton];

    const details = [
      workout.durationMin === undefined ? '' : `Длительность ${formatDuration(workout.durationMin)}`,
      workout.rating === undefined ? '' : `оценка ${workout.rating}`,
    ]
      .filter(Boolean)
      .join(', ');

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, `${workoutTypeName(workout.type)}, ${formatDate(workout.date)}`),
        ...(isEditing && details ? [h('p', { className: 'hint' }, details)] : []),
        ...(isEditing && workout.note ? [h('p', { className: 'hint' }, workout.note)] : []),
        ...cards,
        cards.length > 0 ? addButton : h('div', { className: 'centered' }, addButton),
        ...closeButtons,
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
    if (workout.durationMin !== undefined) {
      hours.value = String(Math.floor(workout.durationMin / 60));
      minutes.value = String(workout.durationMin % 60);
    }
    const note = h('textarea', { rows: 3, value: workout.note ?? '' });
    const date = h('input', { type: 'date', value: workout.date });
    const type = h(
      'select',
      {},
      ...workoutTypes.map((value) => h('option', { value }, workoutTypeName(value))),
    );
    type.value = workout.type;
    let rating = workout.rating;
    const ratingButtons = Array.from({ length: 10 }, (_, index) =>
      h(
        'label',
        { className: 'chip' },
        h('input', {
          type: 'radio',
          name: 'rating',
          checked: workout.rating === index + 1,
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
      h('h1', {}, isEditing ? 'Дата, оценка и заметка' : 'Завершение'),
      ...(isEmpty ? [h('p', { className: 'hint' }, 'В тренировке нет подходов, она не сохранится.')] : []),
      h(
        'form',
        {
          onsubmit: async (event: Event) => {
            event.preventDefault();
            try {
              await finishWorkout(workout, {
                date: (isEditing && date.value) || workout.date,
                type: isEditing ? type.value : workout.type,
                durationMin: parseDuration(hours.value, minutes.value),
                rating,
                note: note.value.trim() || undefined,
              });
              onClosed();
            } catch (problem) {
              error.textContent = problem instanceof Error ? problem.message : 'Не удалось сохранить';
            }
          },
        },
        ...(isEditing ? [field('Дата', date), field('Тип тренировки', type)] : []),
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
        h('button', { type: 'submit', className: 'button' }, isEditing ? 'Сохранить' : 'Завершить'),
        h(
          'button',
          { type: 'button', className: 'button button-secondary', onclick: () => void showWorkout() },
          'Назад',
        ),
        ...(isEditing
          ? [
              h(
                'button',
                {
                  type: 'button',
                  className: 'button button-danger',
                  onclick: async () => {
                    if (confirm(`Удалить тренировку за ${formatDate(workout.date)}? Это не отменить.`)) {
                      await deleteWorkout(workout.id);
                      onClosed();
                    }
                  },
                },
                'Удалить тренировку',
              ),
            ]
          : []),
      ),
    );
  }

  await showWorkout();
}
