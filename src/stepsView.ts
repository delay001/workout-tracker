// Вкладка «Шаги» в «Статистике» (только apk): цель на день, сегодня и итоги за неделю, месяц или год.
// Шаги берутся из Health Connect через native.ts; здесь только показ
import { barChart, type Bar } from './chart';
import { formatDate, formatMonth, todayLocal } from './dates';
import { field, h, stepButton } from './dom';
import { LOCALE, t } from './i18n';
import { getStepGoal, setSetting } from './settings';
import { progressRing } from './statsScreen';
import { compactSteps, fillDays, monthlyAverages, periodRange, stepsSummary, type DaySteps, type StepsPeriod } from './steps';
import { numberInput, radioChips, segmented } from './ui';

// Откуда брать шаги: в apk — native.ts, в тестах — подстановка
export interface StepsSource {
  stepsAccess(): Promise<'missing' | 'denied' | 'granted'>;
  requestStepsAccess(): Promise<void>;
  stepsByDay(from: string, to: string): Promise<DaySteps[]>;
}

let shownPeriod: StepsPeriod = 'week';
let shownOffset = 0;

const number = (value: number): string => value.toLocaleString(LOCALE);
const stepsText = (value: number): string => t('steps.count', { steps: number(value), count: value });

export async function renderStepsView(root: HTMLElement, source: StepsSource): Promise<void> {
  try {
    await showSteps(root, source);
  } catch {
    // Health Connect ответил ошибкой (например, доступ отозвали): подсказка вместо сломанной вкладки
    root.replaceChildren(h('p', { className: 'hint' }, t('steps.error')));
  }
}

async function showSteps(root: HTMLElement, source: StepsSource): Promise<void> {
  const access = await source.stepsAccess();
  if (access === 'missing') {
    root.replaceChildren(h('p', { className: 'hint' }, t('steps.missing')));
    return;
  }
  if (access === 'denied') {
    root.replaceChildren(
      h('p', { className: 'hint' }, t('steps.why')),
      h(
        'button',
        {
          type: 'button',
          className: 'button',
          onclick: async () => {
            await source.requestStepsAccess();
            await renderStepsView(root, source);
          },
        },
        t('steps.allow'),
      ),
    );
    return;
  }

  const rerender = (): void => void renderStepsView(root, source);
  const goal = await getStepGoal();
  const today = todayLocal();
  const range = periodRange(shownPeriod, shownOffset, today);
  // Сегодня входит в текущую неделю/месяц/год; если листаем прошлое — отдельный запрос
  const samples = await source.stepsByDay(range.from, range.to);
  const todaySteps = (shownOffset === 0 ? samples : await source.stepsByDay(today, today))
    .filter((item) => item.date === today)
    .reduce((sum, item) => sum + item.steps, 0);
  const days = fillDays(range.from, range.to, samples);
  const summary = stepsSummary(days, goal, today);

  const goalInput = numberInput('integer', String(goal), 6);
  goalInput.onchange = async () => {
    const value = Number(goalInput.value);
    if (Number.isInteger(value) && value > 0) {
      await setSetting('stepGoal', String(value));
      rerender();
    } else {
      goalInput.value = String(goal);
    }
  };

  const left = goal - todaySteps;
  const todayBlock = h(
    'div',
    { className: 'goal' },
    progressRing(Math.min(100, Math.round((todaySteps / goal) * 100)), number(todaySteps), t('steps.today')),
    h(
      'div',
      {},
      h('p', { className: 'goal-title' }, t('steps.today')),
      h('p', { className: 'hint' }, left > 0 ? t('steps.left', { steps: number(left), count: left }) : t('stats.goalDone')),
    ),
  );

  const periods = segmented(
    radioChips<StepsPeriod>(
      'steps-period',
      t('steps.period'),
      [
        ['week', t('steps.week')],
        ['month', t('steps.month')],
        ['year', t('steps.year')],
      ],
      shownPeriod,
      (value) => {
        shownPeriod = value;
        shownOffset = 0;
        rerender();
      },
    ),
  );

  const [year, month] = range.from.split('-').map(Number);
  const title =
    shownPeriod === 'week'
      ? `${formatDate(range.from)} – ${formatDate(range.to)}`
      : shownPeriod === 'month'
        ? formatMonth(year, month - 1)
        : String(year);
  const next = stepButton('›', t('steps.next'), () => {
    shownOffset += 1;
    rerender();
  });
  next.disabled = shownOffset >= 0;

  const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
  const bars: Bar[] =
    shownPeriod === 'year'
      ? monthlyAverages(days, today).map((average, index) => ({
          value: average,
          label: new Date(year, index, 1).toLocaleDateString(LOCALE, { month: 'narrow' }),
          readout: t('steps.monthReadout', { month: formatMonth(year, index), steps: number(average) }),
          text: average ? compactSteps(average) : '',
        }))
      : days.map((day, index) => ({
          value: day.steps,
          label: shownPeriod === 'week' ? t(`weekday.${weekdays[index]}`) : String(Number(day.date.slice(8))),
          readout: `${formatDate(day.date)}: ${stepsText(day.steps)}`,
          // На месяце 30 столбиков: чисел над ними не поместить, значение видно по нажатию
          text: shownPeriod === 'week' && day.steps ? compactSteps(day.steps) : '',
        }));

  const tile = (value: string, label: string): HTMLElement => h('div', { className: 'stat' }, h('strong', {}, value), label);
  root.replaceChildren(
    todayBlock,
    field(t('steps.goal'), goalInput),
    periods,
    h(
      'div',
      { className: 'month-nav' },
      stepButton('‹', t('steps.prev'), () => {
        shownOffset -= 1;
        rerender();
      }),
      h('h2', {}, title),
      next,
    ),
    // Над графиком сразу сегодняшний день (или месяц), а не последний, еще не наступивший
    barChart(
      bars,
      t('steps.chart'),
      goal,
      shownOffset === 0 ? (shownPeriod === 'year' ? Number(today.slice(5, 7)) - 1 : days.findIndex((day) => day.date === today)) : bars.length - 1,
    ),
    h(
      'div',
      { className: 'stats' },
      tile(number(summary.total), t('steps.total')),
      tile(number(summary.average), t('steps.average')),
      tile(String(summary.daysMet), t('steps.daysMet', { count: summary.daysMet })),
      tile(summary.best ? number(summary.best.steps) : '—', summary.best ? t('steps.best', { date: formatDate(summary.best.date) }) : t('steps.bestNone')),
    ),
  );
}
