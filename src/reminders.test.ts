import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDERS, parseReminders, planReminders, type ReminderFacts, type ReminderSettings } from './reminders';

// Среда, 4 ноября 2026, 12:00 по местному времени
const NOW = new Date('2026-11-04T12:00:00');
const none: ReminderSettings = parseReminders(
  JSON.stringify(Object.fromEntries(Object.keys(DEFAULT_REMINDERS).map((kind) => [kind, { on: false }]))),
);
const facts = (extra: Partial<ReminderFacts> = {}): ReminderFacts => ({
  workoutDates: new Set(),
  weightDates: new Set(),
  ...extra,
});
const local = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${date.toTimeString().slice(0, 5)}`;

describe('planReminders', () => {
  it('тренировка: по выбранным дням, пропускает день, когда тренировка уже есть', () => {
    const settings = { ...none, workout: { on: true, days: [3, 5], time: '18:00' } };
    const plan = planReminders(settings, facts({ workoutDates: new Set(['2026-11-06']) }), NOW);
    // ср 04.11 18:00 и ср 11.11; пт 06.11 пропущена (тренировка уже есть), пт 13.11
    expect(plan.map((item) => local(item.at))).toEqual(['2026-11-04 18:00', '2026-11-11 18:00', '2026-11-13 18:00']);
  });

  it('креатин: каждый день в каждое время, прошедшее сегодня не ставится', () => {
    const settings = { ...none, creatine: { on: true, times: ['09:00', '21:00'] } };
    const plan = planReminders(settings, facts(), NOW);
    expect(local(plan[0].at)).toBe('2026-11-04 21:00');
    expect(local(plan[1].at)).toBe('2026-11-05 09:00');
    expect(plan).toHaveLength(14 * 2 - 1);
  });

  it('давно не был в зале: через N дней после последней тренировки', () => {
    const settings = { ...none, idle: { on: true, days: 4, time: '19:00' } };
    expect(planReminders(settings, facts({ lastWorkout: '2026-11-02' }), NOW)).toEqual([
      { kind: 'idle', at: new Date('2026-11-06T19:00:00'), days: 4 },
    ]);
    // Срок уже прошел — напоминание в ближайшие 19:00
    expect(planReminders(settings, facts({ lastWorkout: '2026-10-20' }), NOW)[0]).toEqual({
      kind: 'idle',
      at: new Date('2026-11-04T19:00:00'),
      days: 15,
    });
    expect(planReminders(settings, facts(), NOW)).toEqual([]);
  });

  it('замеры, копия и незавершенная тренировка', () => {
    const settings: ReminderSettings = {
      ...none,
      measure: { on: true, weeks: 2, time: '10:00' },
      backup: { on: true, days: 7, time: '20:00' },
      unfinished: { on: true, hours: 3 },
    };
    const plan = planReminders(
      settings,
      facts({ lastMeasurement: '2026-10-28', lastBackup: '2026-10-01', activeElapsedMs: 2 * 3_600_000 }),
      NOW,
    );
    expect(plan.map((item) => [item.kind, local(item.at), item.days])).toEqual([
      ['unfinished', '2026-11-04 13:00', undefined],
      ['backup', '2026-11-04 20:00', 34],
      ['measure', '2026-11-11 10:00', undefined],
    ]);
  });

  it('сохраненные настройки дополняются значениями по умолчанию', () => {
    const settings = parseReminders(JSON.stringify({ creatine: { times: ['08:30'] } }));
    expect(settings.creatine).toEqual({ on: true, times: ['08:30'] });
    expect(settings.idle).toEqual(DEFAULT_REMINDERS.idle);
    expect(parseReminders('')).toEqual(DEFAULT_REMINDERS);
  });
});
