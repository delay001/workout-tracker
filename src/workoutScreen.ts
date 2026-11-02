import { formatDate } from './dates';
import { db, findOrCreateExercise, type Exercise, type Workout, type WorkoutExercise } from './db';
import { field, h } from './dom';
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  getActiveWorkout,
  parseDuration,
  parseSet,
  removeSet,
  searchExercises,
  WORKOUT_TYPE_NAMES,
} from './workouts';

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
      ...(isCurrent ? [setForm(exercise)] : []),
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
    const groupInput = h('input', { type: 'text', autocomplete: 'off' });
    const results = h('div');
    const newExercise = h(
      'form',
      {
        hidden: true,
        onsubmit: async (event: Event) => {
          event.preventDefault();
          await choose(await findOrCreateExercise(nameInput.value, groupInput.value.trim() || undefined));
        },
      },
      field('Группа мышц (можно не заполнять)', groupInput),
      h('button', { type: 'submit', className: 'button' }, 'Создать упражнение'),
    );

    async function updateResults(): Promise<void> {
      const name = nameInput.value.trim();
      const found = await searchExercises(name);
      results.replaceChildren(
        ...found.map((exercise) =>
          h(
            'button',
            { type: 'button', className: 'list-button', onclick: () => void choose(exercise) },
            exercise.name,
            h('span', { className: 'muscle-group' }, exercise.muscleGroup ?? ''),
          ),
        ),
      );
      const exactMatch = found.some((exercise) => exercise.nameKey === name.toLowerCase());
      newExercise.hidden = name === '' || exactMatch;
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
