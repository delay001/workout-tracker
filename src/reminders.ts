// Напоминания: настройки и расчет, когда какое прислать. Сами уведомления ставит apk (native.ts),
// здесь только правила, чтобы их можно было проверить тестами.

export type ReminderKind = 'workout' | 'creatine' | 'weigh' | 'measure' | 'idle' | 'unfinished' | 'backup';
export const REMINDER_KINDS: ReminderKind[] = ['workout', 'creatine', 'weigh', 'measure', 'idle', 'unfinished', 'backup'];

export interface ReminderSettings {
  // Дни недели: 0 — воскресенье … 6 — суббота; время — «ЧЧ:ММ»
  workout: { on: boolean; days: number[]; time: string };
  creatine: { on: boolean; times: string[] };
  weigh: { on: boolean; days: number[]; time: string };
  measure: { on: boolean; weeks: number; time: string };
  idle: { on: boolean; days: number; time: string };
  unfinished: { on: boolean; hours: number };
  backup: { on: boolean; days: number; time: string };
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  workout: { on: true, days: [1, 3, 5], time: '18:00' },
  creatine: { on: true, times: ['09:00'] },
  weigh: { on: false, days: [1], time: '08:00' },
  measure: { on: false, weeks: 4, time: '10:00' },
  idle: { on: false, days: 4, time: '19:00' },
  unfinished: { on: false, hours: 3 },
  backup: { on: false, days: 7, time: '20:00' },
};

// Сохраненные настройки поверх значений по умолчанию: новые виды напоминаний появятся сами
export function parseReminders(saved: string): ReminderSettings {
  try {
    const value = JSON.parse(saved) as Partial<ReminderSettings>;
    return Object.fromEntries(
      REMINDER_KINDS.map((kind) => [kind, { ...DEFAULT_REMINDERS[kind], ...value[kind] }]),
    ) as unknown as ReminderSettings;
  } catch {
    return DEFAULT_REMINDERS;
  }
}

// Что известно о данных на момент расчета. Даты — «ГГГГ-ММ-ДД» по местному времени.
export interface ReminderFacts {
  // Дни с тренировками, включая начатую
  workoutDates: Set<string>;
  lastWorkout?: string;
  weightDates: Set<string>;
  lastMeasurement?: string;
  lastBackup?: string;
  // Сколько уже идет секундомер начатой тренировки, мс; нет — тренировка не идет
  activeElapsedMs?: number;
}

export interface PlannedReminder {
  kind: ReminderKind;
  at: Date;
  // Для текста: сколько дней прошло (давно не был в зале, копия)
  days?: number;
}

// На сколько дней вперед ставить. Расписание пересчитывается при каждом уходе из приложения.
export const HORIZON_DAYS = 14;

const DAY_MS = 86_400_000;
const pad = (value: number): string => String(value).padStart(2, '0');
export const dateOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const atTime = (date: string, time: string): Date => new Date(`${date}T${time}:00`);
const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return dateOf(value);
};
const daysBetween = (from: string, to: string): number =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / DAY_MS);

// Разовое напоминание в день due в time; если этот момент уже прошел — в ближайший такой же час
function onceFrom(due: string, time: string, now: Date): Date {
  const today = dateOf(now);
  const day = due > today ? due : today;
  const at = atTime(day, time);
  return at > now ? at : atTime(addDays(day, 1), time);
}

export function planReminders(settings: ReminderSettings, facts: ReminderFacts, now: Date): PlannedReminder[] {
  const today = dateOf(now);
  const days = Array.from({ length: HORIZON_DAYS }, (_, index) => addDays(today, index));
  const weekday = (date: string): number => new Date(`${date}T12:00:00`).getDay();
  const plan: PlannedReminder[] = [];

  if (settings.workout.on) {
    for (const date of days) {
      // Тренировка в этот день уже записана или начата — напоминать незачем
      if (settings.workout.days.includes(weekday(date)) && !facts.workoutDates.has(date)) {
        plan.push({ kind: 'workout', at: atTime(date, settings.workout.time) });
      }
    }
  }
  if (settings.creatine.on) {
    for (const date of days) {
      for (const time of settings.creatine.times) {
        plan.push({ kind: 'creatine', at: atTime(date, time) });
      }
    }
  }
  if (settings.weigh.on) {
    for (const date of days) {
      if (settings.weigh.days.includes(weekday(date)) && !facts.weightDates.has(date)) {
        plan.push({ kind: 'weigh', at: atTime(date, settings.weigh.time) });
      }
    }
  }
  if (settings.measure.on) {
    const due = facts.lastMeasurement ? addDays(facts.lastMeasurement, settings.measure.weeks * 7) : today;
    plan.push({ kind: 'measure', at: onceFrom(due, settings.measure.time, now) });
  }
  if (settings.idle.on && facts.lastWorkout) {
    const at = onceFrom(addDays(facts.lastWorkout, settings.idle.days), settings.idle.time, now);
    plan.push({ kind: 'idle', at, days: daysBetween(facts.lastWorkout, dateOf(at)) });
  }
  if (settings.unfinished.on && facts.activeElapsedMs !== undefined) {
    const left = settings.unfinished.hours * 3_600_000 - facts.activeElapsedMs;
    plan.push({ kind: 'unfinished', at: new Date(now.getTime() + Math.max(left, 60_000)) });
  }
  if (settings.backup.on) {
    const due = facts.lastBackup ? addDays(facts.lastBackup, settings.backup.days) : today;
    const at = onceFrom(due, settings.backup.time, now);
    plan.push({ kind: 'backup', at, days: facts.lastBackup ? daysBetween(facts.lastBackup, dateOf(at)) : undefined });
  }

  return plan.filter((item) => item.at > now).sort((a, b) => a.at.getTime() - b.at.getTime());
}
