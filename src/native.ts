// Связь с Android: напоминания по расписанию и таймер в шторке. Работает только в apk:
// модуль подключается через import('./native') внутри проверок import.meta.env.MODE === 'apk',
// поэтому в браузерную сборку не попадает.
import { App } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Health } from '@capgo/capacitor-health';
import { getBodyWeights } from './bodyWeight';
import { db } from './db';
import { t } from './i18n';
import { getMeasurements } from './measurements';
import { parseReminders, planReminders, type PlannedReminder } from './reminders';
import { getSetting, getStepGoal } from './settings';
import { addDays, type DaySteps } from './steps';
import { formatTime, loadStopwatch, total, type Stopwatch } from './stopwatch';
import { getActiveWorkout } from './workouts';

interface WorkoutTimerPlugin {
  keepAwake(options: { on: boolean }): Promise<void>;
  show(options: { title: string; text: string; running: boolean; elapsedMs: number; channelName: string }): Promise<void>;
  hide(): Promise<void>;
}
interface StepsReminderPlugin {
  schedule(options: { on: boolean; time: string; goal: number; title: string; body: string; channelName: string }): Promise<void>;
  status(): Promise<{ available: boolean; granted: boolean }>;
  requestAccess(): Promise<{ available: boolean; granted: boolean }>;
}
// Свой кусок под Android (StepsReminderPlugin.kt): проверка шагов в заданное время без открытого приложения
const StepsReminder = registerPlugin<StepsReminderPlugin>('StepsReminder');

export const stepsReminderStatus = (): ReturnType<StepsReminderPlugin['status']> => StepsReminder.status();
export const requestStepsReminderAccess = (): ReturnType<StepsReminderPlugin['requestAccess']> => StepsReminder.requestAccess();

// Свой кусок кода под Android (WorkoutTimerPlugin.java): закрепленное уведомление с тикающим временем
const WorkoutTimer = registerPlugin<WorkoutTimerPlugin>('WorkoutTimer');

// Спросить разрешение на уведомления, если еще не спрашивали. true — уведомления разрешены.
export async function ensurePermission(): Promise<boolean> {
  const status = await LocalNotifications.checkPermissions();
  if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  }
  return status.display === 'granted';
}

export async function permissionDenied(): Promise<boolean> {
  return (await LocalNotifications.checkPermissions()).display === 'denied';
}

// Секундомер идет — в шторке тикает время; на паузе — остановленное время; нет секундомера — уведомления нет
export async function syncTimer(watch: Stopwatch | undefined): Promise<void> {
  const now = Date.now();
  if (!watch || total(watch, now) === 0) {
    await WorkoutTimer.hide();
    return;
  }
  if (!(await ensurePermission())) return;
  const running = watch.startedAt !== undefined;
  await WorkoutTimer.show({
    title: t('timer.title'),
    text: running ? t('timer.running') : t('timer.paused', { time: formatTime(total(watch, now)) }),
    running,
    elapsedMs: total(watch, now),
    channelName: t('timer.channel'),
  });
}

const text = (item: PlannedReminder): { title: string; body: string } => ({
  title: t(`reminder.${item.kind}.title`, { days: item.days ?? 0 }),
  body: t(`reminder.${item.kind}.body`, { days: item.days ?? 0 }),
});

// Пересчитать и заново поставить все напоминания по текущим данным и настройкам
export async function rescheduleReminders(): Promise<void> {
  const settings = parseReminders(await getSetting('reminders'));
  // Номер вставляет Android в момент проверки, поэтому в тексте метка вместо числа
  await StepsReminder.schedule({
    ...settings.steps,
    goal: await getStepGoal(),
    title: t('reminder.steps.title'),
    body: t('reminder.steps.body', { left: '#LEFT#' }),
    channelName: t('steps.channel'),
  });
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
  const workouts = await db.workouts.toArray();
  const finished = workouts.filter((workout) => workout.status === 'finished').map((workout) => workout.date).sort();
  const active = await getActiveWorkout();
  const watch = active ? loadStopwatch(active.id) : undefined;
  const measurements = (await getMeasurements()).map((item) => item.date).sort();
  const plan = planReminders(
    settings,
    {
      workoutDates: new Set(workouts.map((workout) => workout.date)),
      lastWorkout: finished.at(-1),
      weightDates: new Set((await getBodyWeights()).map((item) => item.date)),
      lastMeasurement: measurements.at(-1),
      lastBackup: (await getSetting('lastBackupDate')) || undefined,
      activeElapsedMs: watch?.startedAt !== undefined ? total(watch, Date.now()) : undefined,
    },
    new Date(),
  );

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map(({ id }) => ({ id })) });
  }
  if (plan.length === 0) return;
  await LocalNotifications.schedule({
    notifications: plan.map((item, index) => ({
      id: index + 1,
      ...text(item),
      schedule: { at: item.at, allowWhileIdle: true },
      smallIcon: 'ic_stat_dumbbell',
    })),
  });
}

// Экран не гаснет, пока открыта начатая тренировка (флаг окна Android)
export async function setKeepAwake(on: boolean): Promise<void> {
  await WorkoutTimer.keepAwake({ on });
}

// Системная кнопка «Назад»: закрыть открытое окно, иначе нажать «Назад» текущего экрана,
// иначе вернуться на первую вкладку, а на ней — свернуть приложение
function handleBack(): void {
  const dialog = document.querySelector('dialog[open]');
  if (dialog) {
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    return;
  }
  const back = [...document.querySelectorAll<HTMLButtonElement>('#app button')]
    .filter((button) => button.textContent?.trim() === t('common.back') && button.offsetParent !== null)
    .at(-1);
  if (back) {
    back.click();
    return;
  }
  const firstTab = document.querySelector<HTMLButtonElement>('.tabs .tab');
  if (firstTab && !firstTab.classList.contains('tab-active')) {
    firstTab.click();
    return;
  }
  void App.minimizeApp();
}

// При запуске и каждый раз, когда приложение уходит в фон, расписание пересчитывается:
// так оно учитывает все, что изменилось (новая тренировка, вес, копия), без вызовов из каждого экрана
export function startReminders(): void {
  void App.addListener('backButton', handleBack);
  // Разрешение спрашивается при первом запуске: иначе включенные по умолчанию напоминания молчали бы
  void ensurePermission().then(rescheduleReminders);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void rescheduleReminders();
  });
}

// Шаги из Health Connect: 'missing' — Health Connect нет на телефоне, 'denied' — разрешения пока нет
export async function stepsAccess(): Promise<'missing' | 'denied' | 'granted'> {
  if (!(await Health.isAvailable()).available) return 'missing';
  const status = await Health.checkAuthorization({ read: ['steps'] });
  return status.readAuthorized.includes('steps') ? 'granted' : 'denied';
}

// Окно Health Connect «разрешить чтение шагов»; заодно просим историю старше 30 дней, если телефон умеет
export async function requestStepsAccess(): Promise<void> {
  await Health.requestAuthorization({ read: ['steps'], requestHistoryAccess: true });
}

// Шаги по дням с from по to включительно (ГГГГ-ММ-ДД), будущее не спрашиваем. Берем сводку Health Connect,
// а не отдельные записи: если шаги пишут и телефон, и часы, сводка не посчитает их дважды
export async function stepsByDay(from: string, to: string): Promise<DaySteps[]> {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(Math.min(Date.now(), new Date(`${addDays(to, 1)}T00:00:00`).getTime()));
  if (start >= end) return [];
  const { samples } = await Health.queryAggregated({
    dataType: 'steps',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    bucket: 'day',
    aggregation: 'sum',
  });
  return samples.map((item) => ({ date: new Date(item.startDate).toLocaleDateString('sv-SE'), steps: item.value }));
}
