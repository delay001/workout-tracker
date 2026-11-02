import { formatDate, formatDuration, formatMonth, monthCells, shiftMonth, todayLocal } from './dates';
import type { Workout } from './db';
import { h } from './dom';
import { renderExercisesScreen } from './exercisesScreen';
import { getFinishedWorkouts, WORKOUT_TYPE_NAMES } from './workouts';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Месяц запоминается, чтобы после правки тренировки вернуться туда же
const now = new Date();
let shown = { year: now.getFullYear(), month: now.getMonth() };

function summary(workout: Workout): string {
  return [
    `Упражнений: ${workout.exercises.length}`,
    workout.durationMin === undefined ? '' : formatDuration(workout.durationMin),
    workout.rating === undefined ? '' : `оценка ${workout.rating}`,
  ]
    .filter(Boolean)
    .join(', ');
}

let shownView: 'workouts' | 'exercises' = 'workouts';

export async function renderHistoryTab(
  root: HTMLElement,
  onOpen: (workout: Workout) => void,
): Promise<void> {
  const body = h('div');

  const viewChip = (label: string, view: typeof shownView): HTMLElement =>
    h(
      'label',
      { className: 'chip' },
      h('input', {
        type: 'radio',
        name: 'history-view',
        checked: view === shownView,
        onchange: () => {
          shownView = view;
          void showView();
        },
      }),
      label,
    );

  async function showView(): Promise<void> {
    if (shownView === 'workouts') {
      await renderWorkoutsView(body, onOpen);
    } else {
      await renderExercisesScreen(body);
    }
  }

  root.replaceChildren(
    h('h1', {}, 'История'),
    h(
      'div',
      { className: 'chips', role: 'radiogroup', ariaLabel: 'Что показать' },
      viewChip('Тренировки', 'workouts'),
      viewChip('Упражнения', 'exercises'),
    ),
    body,
  );
  await showView();
}

async function renderWorkoutsView(
  root: HTMLElement,
  onOpen: (workout: Workout) => void,
): Promise<void> {
  const workouts = await getFinishedWorkouts();
  const today = todayLocal();

  function show(selectedDate?: string): void {
    const cells = monthCells(shown.year, shown.month);
    const shownPrefix = cells.find(Boolean)!.slice(0, 7);

    const dayCell = (date: string | null): HTMLElement => {
      if (!date) {
        return h('span');
      }
      const dayWorkouts = workouts.filter((workout) => workout.date === date);
      const number = String(Number(date.slice(8)));
      const todayClass = date === today ? ' day-today' : '';
      if (dayWorkouts.length === 0) {
        return h('span', { className: `day${todayClass}` }, number);
      }

      const more = dayWorkouts.length > 1 ? ` +${dayWorkouts.length - 1}` : '';
      return h(
        'button',
        {
          type: 'button',
          className: `day day-workout${todayClass}`,
          onclick: () => {
            if (dayWorkouts.length === 1) {
              onOpen(dayWorkouts[0]);
            } else {
              show(date);
            }
          },
        },
        number,
        h('span', { className: 'day-type' }, `${WORKOUT_TYPE_NAMES[dayWorkouts.at(-1)!.type]}${more}`),
      );
    };

    const monthButton = (label: string, name: string, delta: number): HTMLButtonElement =>
      h(
        'button',
        {
          type: 'button',
          className: 'step-button',
          ariaLabel: name,
          onclick: () => {
            shown = shiftMonth(shown.year, shown.month, delta);
            show();
          },
        },
        label,
      );

    const listed = workouts.filter((workout) =>
      selectedDate ? workout.date === selectedDate : workout.date.startsWith(shownPrefix),
    );

    root.replaceChildren(
      h(
        'div',
        { className: 'month-nav' },
        monthButton('‹', 'Предыдущий месяц', -1),
        h('h2', {}, formatMonth(shown.year, shown.month)),
        monthButton('›', 'Следующий месяц', 1),
      ),
      h(
        'div',
        { className: 'calendar' },
        ...WEEKDAYS.map((day) => h('span', { className: 'weekday' }, day)),
        ...cells.map(dayCell),
      ),
      ...(listed.length === 0 ? [h('p', { className: 'hint' }, 'В этом месяце тренировок нет')] : []),
      ...listed.map((workout) =>
        h(
          'button',
          { type: 'button', className: 'list-button', onclick: () => onOpen(workout) },
          `${formatDate(workout.date)}, ${WORKOUT_TYPE_NAMES[workout.type]}`,
          h('span', { className: 'muscle-group' }, summary(workout)),
        ),
      ),
    );
  }

  show();
}
