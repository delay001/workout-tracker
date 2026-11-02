import { guessMuscleGroup, MUSCLE_GROUPS } from './catalog';
import { formatDate } from './dates';
import { db, findOrCreateExercise, type Exercise, type Workout, type WorkoutExercise } from './db';
import { field, h } from './dom';
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  getActiveWorkout,
  isExactMatch,
  parseDuration,
  parseSet,
  removeSet,
  searchOptions,
  setMuscleGroup,
  WORKOUT_TYPE_NAMES,
} from './workouts';

const NO_GROUP = 'Без группы';

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

  async function reload(): Promise<void> {
    workout = (await getActiveWorkout()) ?? workout;
    await showWorkout();
  }

  function setForm(exercise: Exercise): HTMLFormElement {
    const weight = h('input', { type: 'text', inputMode: 'decimal', autocomplete: 'off' });
    const reps = h('input', { type: 'text', inputMode: 'numeric', autocomplete: 'off' });
    const warmup = h('input', { type: 'checkbox' });
    const error = h('p', { className: 'error', role: 'alert' });

    return h(
      'form',
      {
        className: 'set-form',
        onsubmit: async (event: Event) => {
          event.preventDefault();
          try {
            await addSet(workout, exercise.id, parseSet(weight.value, reps.value, warmup.checked));
            await reload();
          } catch (problem) {
            error.textContent = problem instanceof Error ? problem.message : 'Не удалось сохранить';
          }
        },
      },
      h('div', { className: 'set-inputs' }, field('Вес, кг', weight), field('Повторения', reps)),
      h('label', { className: 'checkbox' }, warmup, 'Разминочный'),
      error,
      h('button', { type: 'submit', className: 'button' }, 'Записать подход'),
    );
  }

  function exerciseCard(item: WorkoutExercise, exercise: Exercise): HTMLElement {
    const isCurrent = item.exerciseId === currentId;

    const group = groupSelect(exercise.muscleGroup);
    group.onchange = async () => {
      await setMuscleGroup(exercise.id, group.value || undefined);
      await reload();
    };

    const rows = item.sets.map((set, index) =>
      h(
        'li',
        { className: 'set-row' },
        h('span', {}, `${set.weight} × ${set.reps}${set.warmup ? ' (разминка)' : ''}`),
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
            void showWorkout();
          },
        },
        exercise.name,
        h('span', { className: 'muscle-group' }, exercise.muscleGroup ?? ''),
      ),
      h('ol', { className: 'set-list' }, ...rows),
      ...(isCurrent ? [setForm(exercise), field('Группа мышц', group)] : []),
    );
  }

  async function showWorkout(): Promise<void> {
    const exercises = await db.exercises.bulkGet(workout.exercises.map((item) => item.exerciseId));
    const cards = workout.exercises.flatMap((item, index) => {
      const exercise = exercises[index];
      return exercise ? [exerciseCard(item, exercise)] : [];
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

  async function choose(exercise: Exercise): Promise<void> {
    await addExerciseToWorkout(workout, exercise.id);
    currentId = exercise.id;
    await reload();
  }

  async function showAddExercise(): Promise<void> {
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

      const items: HTMLElement[] = [];
      let lastGroup: string | undefined;
      for (const option of found) {
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
      h('h1', {}, 'Добавить упражнение'),
      field('Название', nameInput),
      newExercise,
      results,
      h(
        'button',
        { type: 'button', className: 'button button-secondary', onclick: () => void showWorkout() },
        'Назад',
      ),
    );
    await updateResults();
  }

  function showFinish(): void {
    const duration = h('input', { type: 'text', inputMode: 'numeric', autocomplete: 'off' });
    const note = h('textarea', { rows: 3 });
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
                durationMin: parseDuration(duration.value),
                note: note.value.trim() || undefined,
              });
              onClosed(saved ? 'Тренировка сохранена' : 'Пустая тренировка удалена');
            } catch (problem) {
              error.textContent = problem instanceof Error ? problem.message : 'Не удалось сохранить';
            }
          },
        },
        field('Длительность, минут', duration),
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
