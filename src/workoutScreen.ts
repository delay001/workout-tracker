import { MUSCLE_GROUPS } from './catalog';
import { renderExerciseForm } from './exerciseSettingsScreen';
import { vibrate } from './haptics';
import { clearStopwatch, loadStopwatch, pause, saveStopwatch, start, stopwatchBar, toMinutes, total } from './stopwatch';
import { motivationMessage } from './motivation';
import { syncAchievements } from './motivationScreens';
import { getMonthlyGoal, getWeightStep } from './settings';
import { numberInput, stepper } from './ui';
import { formatWeight, toWeight, weightUnit } from './units';
import { formatDate, formatDuration } from './dates';
import {
  db,
  findOrCreateExercise,
  type Exercise,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from './db';
import { confetti, confirmDialog, dateField, field, h, requiredMark, showToast } from './dom';
import { workoutStats } from './progress';
import {
  addExerciseToWorkout,
  addSet,
  bestSet,
  deleteWorkout,
  finishWorkout,
  formatSet,
  getFinishedWorkouts,
  isCardio,
  parseCardioSet,
  getLastPerformance,
  getPriorSets,
  getWorkoutTypes,
  isExactMatch,
  type LastPerformance,
  parseDuration,
  parseSet,
  recordLabels,
  removeExercise,
  removeSet,
  replaceExercise,
  searchOptions,
  updateSet,
  workoutTypeName,
} from './workouts';
import { t } from './i18n';

const NO_GROUP = t('common.noGroup');

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
  const weightStep = await getWeightStep();
  // Завершенная тренировка открыта из истории: изменения в ней сохраняются сразу же
  const isEditing = startedWorkout.status === 'finished';
  const nextExercise =
    workout.exercises.find((item) => item.sets.length === 0) ?? workout.exercises.at(-1);
  let currentId = isEditing ? undefined : nextExercise?.exerciseId;
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

    const cardio = isCardio(exercise);
    const weight = numberInput('decimal', filled ? String(toWeight(filled.weight)) : '');
    const reps = numberInput('integer', filled ? String(filled.reps) : '', 3);
    const minutes = numberInput('integer', filled?.minutes === undefined ? '' : String(filled.minutes), 3);
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
            const set = cardio
              ? parseCardioSet(minutes.value)
              : parseSet(weight.value, reps.value, warmup.checked, toFailure.checked);
            if (index === undefined) {
              await addSet(workout, exercise.id, set);
              const prior = await getPriorSets(exercise.id, workout);
              const record = recordLabels([...item.sets, set], prior).at(-1);
              if (record) {
                showToast(
                  t('record.toast', {
                    set: `${toWeight(set.weight)}×${set.reps}`,
                    name: exercise.name,
                    kinds: record.replace(t('record.prefix', { kinds: '' }), ''),
                  }),
                );
                vibrate(200);
                confetti();
              } else {
                // Короткий отклик: подход записан, можно не смотреть на экран
                vibrate(30);
              }
            } else {
              await updateSet(workout, exercise.id, index, set);
            }
            await reload();
          } catch (problem) {
            error.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
          }
        },
      },
      ...(cardio
        ? [field(t('workout.minutes'), stepper(minutes, 5, 1, 600), true)]
        : [
            h(
              'div',
              { className: 'set-inputs' },
              field(t('weight.input', { unit: weightUnit() }), stepper(weight, weightStep, 0), true),
              field(t('set.reps'), stepper(reps, 1, 1), true),
            ),
            h(
              'div',
              { className: 'checkboxes' },
              h('label', { className: 'checkbox' }, warmup, t('set.warmup')),
              h('label', { className: 'checkbox' }, toFailure, t('set.toFailure')),
            ),
          ]),
      error,
      h(
        'button',
        { type: 'submit', className: 'button' },
        index === undefined ? t('set.record') : t('set.saveChanges'),
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
              t('set.cancel'),
            ),
          ]),
    );
  }

  function peakText(peak: WorkoutSet): string {
    return peak.minutes === undefined
      ? t('unit.setValue', { weight: formatWeight(peak.weight), reps: peak.reps })
      : formatSet(peak);
  }

  function lastTimeBlock(last?: LastPerformance): HTMLElement {
    const peak = last && bestSet(last.sets);
    return h(
      'section',
      { className: 'last-time' },
      h('h2', {}, last ? t('workout.lastTimeDate', { date: formatDate(last.date) }) : t('workout.lastTime')),
      h('p', {}, peak ? peakText(peak) : t('workout.noRecords')),
    );
  }

  function exerciseCard(
    item: WorkoutExercise,
    exercise: Exercise,
    records: string[],
    last?: LastPerformance,
  ): HTMLElement {
    const isCurrent = item.exerciseId === currentId;

    const rows = item.sets.map((set, index) =>
      h(
        'li',
        { className: isCurrent && index === editedIndex ? 'set-row set-row-edited' : 'set-row' },
        h(
          'button',
          {
            type: 'button',
            className: 'set-text',
            ariaLabel: t('set.fix', { set: formatSet(set) }),
            onclick: () => {
              currentId = item.exerciseId;
              editedIndex = index;
              void showWorkout();
            },
          },
          formatSet(set),
          ...(records[index] ? [h('span', { className: 'record' }, records[index])] : []),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'remove-button',
            ariaLabel: t('set.delete'),
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
        t('workout.replace'),
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: async () => {
            const question = t('workout.deleteExercise', { name: exercise.name });
            if (item.sets.length === 0 || (await confirmDialog(question))) {
              await removeExercise(workout, item.exerciseId);
              await reload();
            }
          },
        },
        t('workout.delete'),
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
      ...(isCurrent ? [setForm(item, exercise), actions] : []),
    );
  }

  const statRow = (label: string, value: string): HTMLElement =>
    h('p', { className: 'set-row' }, label, h('strong', {}, value));

  // Итоги тренировки: упражнения, подходы, тоннаж
  async function statRowsFor(shown: Workout): Promise<HTMLElement[]> {
    const stats = workoutStats(shown);
    return [
      statRow(t('workoutStats.exercises'), String(stats.exercises)),
      statRow(t('workoutStats.sets'), String(stats.sets)),
      statRow(t('workoutStats.tonnage'), formatWeight(stats.tonnage)),
    ];
  }

  // Карточка после завершения: что сделано и сколько рекордов побито
  async function showSummary(message: string): Promise<void> {
    const finished = (await db.workouts.get(workout.id)) ?? workout;
    const priorSets = await Promise.all(
      finished.exercises.map((item) => getPriorSets(item.exerciseId, finished)),
    );
    const records = finished.exercises.reduce(
      (sum, item, index) => sum + recordLabels(item.sets, priorSets[index]).filter(Boolean).length,
      0,
    );
    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, t('finish.title')),
        h(
          'section',
          { className: 'finish-card' },
          h('p', { className: 'finish-head' }, `${workoutTypeName(finished.type)}, ${formatDate(finished.date)}`),
          h('p', { className: 'finish-message' }, message),
          ...(finished.durationMin ? [statRow(t('finish.duration'), formatDuration(finished.durationMin))] : []),
          ...(finished.rating ? [statRow(t('finish.rating'), String(finished.rating))] : []),
          ...(records > 0 ? [statRow(t('finish.records'), String(records))] : []),
        ),
        ...(await statRowsFor(finished)),
        h('button', { type: 'button', className: 'button bottom-action', onclick: onClosed }, t('finish.done')),
      ),
    );
    if (records > 0) {
      confetti();
    }
  }

  async function showWorkout(): Promise<void> {
    const exercises = await db.exercises.bulkGet(workout.exercises.map((item) => item.exerciseId));
    const last = currentId === undefined ? undefined : await getLastPerformance(currentId, workout);
    const priorSets = await Promise.all(
      workout.exercises.map((item) => getPriorSets(item.exerciseId, workout)),
    );
    const cards = workout.exercises.flatMap((item, index) => {
      const exercise = exercises[index];
      const records = recordLabels(item.sets, priorSets[index]);
      return exercise ? [exerciseCard(item, exercise, records, last)] : [];
    });

    const statRows = await statRowsFor(workout);

    const addButton = h(
      'button',
      { type: 'button', className: 'button', onclick: () => void showAddExercise() },
      t('workout.addExercise'),
    );

    const backButton = h(
      'button',
      {
        type: 'button',
        className: 'button button-secondary bottom-action',
        // Пустая тренировка при завершении удаляется, поэтому завершенную спрашиваем
        onclick: async () => {
          const hasSets = workout.exercises.some((item) => item.sets.length > 0);
          // Секундомер уже запущен: тренировка идет, хоть подходов еще нет — оставляем ее активной
          if (!isEditing && total(loadStopwatch(workout.id), Date.now()) > 0) {
            onClosed();
            return;
          }
          if (isEditing && !hasSets && !(await confirmDialog(t('workout.emptyDeleted')))) {
            return;
          }
          await finishWorkout(workout, {});
          onClosed();
        },
      },
      t('common.back'),
    );

    const closeButtons = isEditing
      ? [
          h(
            'button',
            { type: 'button', className: 'button button-secondary', onclick: () => void showFinish() },
            t('workout.summary'),
          ),
          backButton,
        ]
      : workout.exercises.length > 0
        ? [
            h(
              'button',
              { type: 'button', className: 'button button-secondary', onclick: () => void showFinish() },
              t('workout.finish'),
            ),
            // Тренировка остается активной, вернуться можно с вкладки «Тренировка»
            h('button', { type: 'button', className: 'button button-secondary', onclick: onClosed }, t('common.back')),
          ]
        : [backButton];

    const details = [
      workout.durationMin === undefined ? '' : t('workout.duration', { value: formatDuration(workout.durationMin) }),
      workout.rating === undefined ? '' : t('common.rating', { rating: workout.rating }),
    ]
      .filter(Boolean)
      .join(', ');

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, `${workoutTypeName(workout.type)}, ${formatDate(workout.date)}`),
        ...(isEditing ? [] : [stopwatchBar(workout.id)]),
        ...(isEditing && details ? [h('p', { className: 'hint' }, details)] : []),
        ...(isEditing && workout.note ? [h('p', { className: 'hint' }, workout.note)] : []),
        ...(isEditing ? statRows : []),
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

    const results = h('div', { hidden: true });
    nameInput.onfocus = () => {
      results.hidden = false;
    };

    let selectedGroup = '';
    const groupFilter = h(
      'div',
      { className: 'chips', role: 'radiogroup', ariaLabel: t('common.muscleGroup') },
      ...[[t('common.all'), ''], ...MUSCLE_GROUPS.map((group) => [group, group])].map(([label, value]) =>
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

    // Нового упражнения нет в каталоге: открывается то же окно создания, что и в настройках
    const newExercise = h(
      'button',
      {
        type: 'button',
        className: 'button',
        hidden: true,
        onclick: () =>
          void renderExerciseForm(
            root,
            undefined,
            async (name) => choose(await findOrCreateExercise(name)),
            () => void showAddExercise(replacedId),
            nameInput.value.trim(),
          ),
      },
      t('workout.createExercise'),
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
    }

    nameInput.oninput = () => void updateResults();

    root.replaceChildren(
      h(
        'div',
        { className: 'screen' },
        h('h1', {}, replacedId === undefined ? t('workout.addExercise') : t('workout.replaceExercise')),
        field(t('common.name'), nameInput),
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
          t('common.back'),
        ),
      ),
    );
    await updateResults();
  }

  async function showFinish(): Promise<void> {
    // Ни одного записанного подхода: тренировка не сохраняется, форма завершения не нужна
    if (!isEditing && workout.exercises.every((item) => item.sets.length === 0)) {
      if (await confirmDialog(t('workout.emptyDeleted'))) {
        await finishWorkout(workout, {});
        clearStopwatch(workout.id);
        onClosed();
      }
      return;
    }
    const hours = numberInput('integer', '', 2);
    const minutes = numberInput('integer', '', 2);
    // Секундомер встает на паузу, его время переезжает в длительность. «Назад» запустит его снова.
    let fromWatch: number | undefined;
    if (!isEditing) {
      const watch = loadStopwatch(workout.id);
      const now = Date.now();
      saveStopwatch(workout.id, { ...pause(watch, now), resumeOnBack: watch.startedAt !== undefined });
      fromWatch = total(watch, now) > 0 ? toMinutes(total(watch, now)) : undefined;
    }
    const durationMin = fromWatch ?? workout.durationMin;
    if (durationMin !== undefined) {
      hours.value = String(Math.floor(durationMin / 60));
      minutes.value = String(durationMin % 60);
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
      h('h1', {}, isEditing ? t('workout.summary') : t('workout.finishing')),
      ...(isEmpty ? [h('p', { className: 'hint' }, t('workout.emptyHint'))] : []),
      h(
        'form',
        {
          onsubmit: async (event: Event) => {
            event.preventDefault();
            try {
              const durationMin = parseDuration(hours.value, minutes.value);
              // Длительность и оценка обязательны; пустая тренировка все равно удаляется, ей они не нужны
              if (!isEmpty && durationMin === undefined) {
                throw new Error(t('workout.needDuration'));
              }
              if (!isEmpty && rating === undefined) {
                throw new Error(t('workout.needRating'));
              }
              const saved = await finishWorkout(workout, {
                date: (isEditing && date.value) || workout.date,
                type: isEditing ? type.value : workout.type,
                durationMin,
                rating,
                note: note.value.trim() || undefined,
              });
              if (!isEditing) {
                clearStopwatch(workout.id);
              }
              if (saved && !isEditing) {
                const month = workout.date.slice(0, 7);
                const count = (await getFinishedWorkouts()).filter((item) => item.date.startsWith(month)).length;
                await syncAchievements(true);
                await showSummary(motivationMessage(count, await getMonthlyGoal()));
                return;
              }
              onClosed();
            } catch (problem) {
              error.textContent = problem instanceof Error ? problem.message : t('common.saveFailed');
            }
          },
        },
        ...(isEditing ? [field(t('common.date'), dateField(date)), field(t('workout.type'), type)] : []),
        h(
          'div',
          { className: 'set-inputs' },
          field(t('workout.hours'), stepper(hours, 1, 0), true),
          field(t('workout.minutes'), stepper(minutes, 5, 0, 59), true),
        ),
        h(
          'div',
          { className: 'field' },
          h('span', {}, t('workout.ratingTitle'), requiredMark()),
          h('div', { className: 'rating', role: 'radiogroup', ariaLabel: t('workout.ratingLabel') }, ...ratingButtons),
        ),
        field(t('workout.note'), note),
        error,
        h('button', { type: 'submit', className: 'button' }, isEditing ? t('common.save') : t('workout.finishShort')),
        h(
          'button',
          {
            type: 'button',
            className: 'button button-secondary',
            onclick: () => {
              const watch = loadStopwatch(workout.id);
              if (watch.resumeOnBack) {
                saveStopwatch(workout.id, start(watch, Date.now()));
              }
              void showWorkout();
            },
          },
          t('common.back'),
        ),
        ...(isEditing
          ? [
              h(
                'button',
                {
                  type: 'button',
                  className: 'button button-danger',
                  onclick: async () => {
                    if (await confirmDialog(t('workout.deleteConfirm', { date: formatDate(workout.date) }))) {
                      await deleteWorkout(workout.id);
                      onClosed();
                    }
                  },
                },
                t('workout.deleteWorkout'),
              ),
            ]
          : []),
      ),
    );
  }

  await showWorkout();
}
