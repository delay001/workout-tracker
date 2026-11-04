// Связь с Android: напоминания по расписанию и таймер в шторке. Работает только в apk:
// модуль подключается через import('./native') внутри проверок import.meta.env.MODE === 'apk',
// поэтому в браузерную сборку не попадает.
import { registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getBodyWeights } from './bodyWeight';
import { db } from './db';
import { t } from './i18n';
import { getMeasurements } from './measurements';
import { parseReminders, planReminders, type PlannedReminder } from './reminders';
import { getSetting } from './settings';
import { formatTime, loadStopwatch, total, type Stopwatch } from './stopwatch';
import { getActiveWorkout } from './workouts';

interface WorkoutTimerPlugin {
  show(options: { title: string; text: string; running: boolean; elapsedMs: number; channelName: string }): Promise<void>;
  hide(): Promise<void>;
}
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
  if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
  const workouts = await db.workouts.toArray();
  const finished = workouts.filter((workout) => workout.status === 'finished').map((workout) => workout.date).sort();
  const active = await getActiveWorkout();
  const watch = active ? loadStopwatch(active.id) : undefined;
  const measurements = (await getMeasurements()).map((item) => item.date).sort();
  const plan = planReminders(
    parseReminders(await getSetting('reminders')),
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

// При запуске и каждый раз, когда приложение уходит в фон, расписание пересчитывается:
// так оно учитывает все, что изменилось (новая тренировка, вес, копия), без вызовов из каждого экрана
export function startReminders(): void {
  void rescheduleReminders();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void rescheduleReminders();
  });
}
