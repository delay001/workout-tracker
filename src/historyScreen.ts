import { pageHeader } from './avatar';
import { renderBodyWeightView } from './bodyWeightScreen';
import { formatDate, formatDuration, formatMonth, monthCells, shiftMonth, todayLocal } from './dates';
import type { Workout } from './db';
import { emptyState, h } from './dom';
import { renderExercisesScreen } from './exercisesScreen';
import { renderMeasurementsView } from './measurementsScreen';
import { getFinishedWorkouts, workoutTypeName } from './workouts';
import { t } from './i18n';

const WEEKDAYS = [t('weekday.mon'), t('weekday.tue'), t('weekday.wed'), t('weekday.thu'), t('weekday.fri'), t('weekday.sat'), t('weekday.sun')];

// Месяц запоминается, чтобы после правки тренировки вернуться туда же
function currentMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

let shown = currentMonth();

// Нажатие на вкладку открывает текущий месяц, а возврат из тренировки оставляет выбранный
export function resetHistoryMonth(): void {
  shown = currentMonth();
}

function summary(workout: Workout): string {
  return [
    t('history.summary', { count: workout.exercises.length }),
    workout.durationMin === undefined ? '' : formatDuration(workout.durationMin),
    workout.rating === undefined ? '' : t('common.rating', { rating: workout.rating }),
  ]
    .filter(Boolean)
    .join(', ');
}

let shownView: 'workouts' | 'exercises' | 'weight' | 'measurements' = 'workouts';

export async function renderHistoryTab(
  root: HTMLElement,
  onOpen: (workout: Workout) => void,
  onOpenSettings: () => void,
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
    } else if (shownView === 'exercises') {
      await renderExercisesScreen(body);
    } else if (shownView === 'weight') {
      await renderBodyWeightView(body);
    } else {
      await renderMeasurementsView(body);
    }
  }

  root.replaceChildren(
    await pageHeader(t('tab.history'), onOpenSettings),
    h(
      'div',
      { className: 'chips segmented segmented-small', role: 'radiogroup', ariaLabel: t('history.whatToShow') },
      viewChip(t('common.workouts'), 'workouts'),
      viewChip(t('common.exercises'), 'exercises'),
      viewChip(t('history.bodyWeight'), 'weight'),
      viewChip(t('history.measurements'), 'measurements'),
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
        h('span', { className: 'day-type' }, `${workoutTypeName(dayWorkouts.at(-1)!.type)}${more}`),
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

    // Месяц и год выбираются одним полем: название месяца поверх невидимого системного выбора месяца
    const monthPicker = (): HTMLElement => {
      const input = h('input', {
        type: 'month',
        className: 'month-picker-input',
        ariaLabel: t('history.pickMonth'),
        value: `${shown.year}-${String(shown.month + 1).padStart(2, '0')}`,
        onchange: () => {
          const [year, month] = input.value.split('-').map(Number);
          if (year && month) {
            shown = { year, month: month - 1 };
            show();
          }
        },
      });
      input.onclick = () => {
        try {
          input.showPicker();
        } catch {
          // Старые браузеры открывают выбор сами по нажатию на поле
        }
      };
      return h('label', { className: 'month-picker' }, h('span', {}, `${formatMonth(shown.year, shown.month)} ▾`), input);
    };

    const monthCount = workouts.filter((workout) => workout.date.startsWith(shownPrefix)).length;
    const listed = workouts.filter((workout) =>
      selectedDate ? workout.date === selectedDate : workout.date.startsWith(shownPrefix),
    );

    root.replaceChildren(
      h(
        'div',
        { className: 'month-nav' },
        monthButton('‹', t('common.prevMonth'), -1),
        monthPicker(),
        monthButton('›', t('common.nextMonth'), 1),
      ),
      h(
        'div',
        { className: 'calendar' },
        ...WEEKDAYS.map((day) => h('span', { className: 'weekday' }, day)),
        ...cells.map(dayCell),
      ),
      monthCount > 0
        ? h('p', { className: 'hint' }, t('history.monthCount', { count: monthCount }))
        : emptyState('🔥', t('history.emptyMonth')),
      ...listed.map((workout) =>
        h(
          'button',
          { type: 'button', className: 'list-button', onclick: () => onOpen(workout) },
          `${formatDate(workout.date)}, ${workoutTypeName(workout.type)}`,
          h('span', { className: 'muscle-group' }, summary(workout)),
        ),
      ),
    );
  }

  show();
}
