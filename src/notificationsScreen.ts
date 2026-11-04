import { field, h } from './dom';
import { LOCALE, t } from './i18n';
import { parseReminders, REMINDER_KINDS, type ReminderKind, type ReminderSettings } from './reminders';
import { getSetting, setSetting } from './settings';
import { numberInput, select } from './ui';

const IN_APK = import.meta.env.MODE === 'apk';

// Дни недели с понедельника; значение — номер дня как у Date.getDay (0 — воскресенье)
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const dayName = (day: number): string =>
  new Date(2026, 10, 1 + day).toLocaleDateString(LOCALE, { weekday: 'short' }); // 1 ноября 2026 — воскресенье

// Настройки уведомлений: у каждого напоминания переключатель и свои параметры
export async function renderNotificationsScreen(root: HTMLElement, onBack: () => void): Promise<void> {
  const settings = parseReminders(await getSetting('reminders'));
  const status = h('p', { className: 'hint' });

  async function save(): Promise<void> {
    await setSetting('reminders', JSON.stringify(settings));
    if (IN_APK) {
      const native = await import('./native');
      await native.rescheduleReminders();
    }
  }

  async function showPermission(): Promise<void> {
    if (!IN_APK) {
      status.textContent = t('notify.onlyApk');
      return;
    }
    const native = await import('./native');
    const anyOn = REMINDER_KINDS.some((kind) => settings[kind].on);
    const allowed = anyOn ? await native.ensurePermission() : true;
    status.textContent = allowed ? '' : t('notify.denied');
    status.className = allowed ? 'hint' : 'error';
    if (allowed) await native.rescheduleReminders();
  }

  const timeInput = (value: string, onChange: (value: string) => void): HTMLInputElement => {
    const input = h('input', { type: 'time', value, className: 'time-input' });
    input.onchange = () => {
      if (input.value) onChange(input.value);
    };
    return input;
  };

  const daysPicker = (days: number[]): HTMLElement =>
    h(
      'div',
      { className: 'chips segmented weekday-chips', role: 'group', ariaLabel: t('notify.days') },
      ...WEEK.map((day) =>
        h(
          'label',
          { className: 'chip' },
          h('input', {
            type: 'checkbox',
            checked: days.includes(day),
            onchange: (event: Event) => {
              const on = (event.target as HTMLInputElement).checked;
              const next = on ? [...days, day] : days.filter((item) => item !== day);
              days.splice(0, days.length, ...next);
              void save();
            },
          }),
          dayName(day),
        ),
      ),
    );

  const count = (value: number, digits: number, onChange: (value: number) => void): HTMLInputElement => {
    const input = numberInput('integer', String(value), digits);
    input.onchange = () => {
      const next = Number(input.value);
      if (Number.isInteger(next) && next > 0) onChange(next);
    };
    return input;
  };

  // Параметры каждого напоминания под его переключателем
  function controls(kind: ReminderKind, s: ReminderSettings): HTMLElement[] {
    const set = <K extends ReminderKind>(k: K, patch: Partial<ReminderSettings[K]>): void => {
      Object.assign(s[k], patch);
      void save();
    };
    switch (kind) {
      case 'workout':
      case 'weigh':
        return [
          daysPicker(s[kind].days),
          field(t('notify.time'), timeInput(s[kind].time, (time) => set(kind, { time }))),
        ];
      case 'creatine': {
        const list = h('div', { className: 'time-list' });
        const draw = (): void => {
          list.replaceChildren(
            ...s.creatine.times.map((time, index) =>
              h(
                'div',
                { className: 'time-row' },
                timeInput(time, (value) => {
                  s.creatine.times[index] = value;
                  void save();
                }),
                ...(s.creatine.times.length > 1
                  ? [
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'remove-button',
                          ariaLabel: t('notify.removeTime'),
                          onclick: () => {
                            s.creatine.times.splice(index, 1);
                            draw();
                            void save();
                          },
                        },
                        '✕',
                      ),
                    ]
                  : []),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'button button-secondary',
                onclick: () => {
                  s.creatine.times.push('21:00');
                  draw();
                  void save();
                },
              },
              t('notify.addTime'),
            ),
          );
        };
        draw();
        return [list];
      }
      case 'measure':
        return [
          field(
            t('notify.every'),
            select(
              [1, 2, 4].map((weeks): [string, string] => [String(weeks), t('notify.weeks', { weeks })]),
              String(s.measure.weeks),
              (value) => set('measure', { weeks: Number(value) }),
            ),
          ),
          field(t('notify.time'), timeInput(s.measure.time, (time) => set('measure', { time }))),
        ];
      case 'idle':
        return [
          field(t('notify.afterDays'), count(s.idle.days, 2, (days) => set('idle', { days }))),
          field(t('notify.time'), timeInput(s.idle.time, (time) => set('idle', { time }))),
        ];
      case 'unfinished':
        return [field(t('notify.afterHours'), count(s.unfinished.hours, 2, (hours) => set('unfinished', { hours })))];
      case 'backup':
        return [
          field(t('notify.everyDays'), count(s.backup.days, 2, (days) => set('backup', { days }))),
          field(t('notify.time'), timeInput(s.backup.time, (time) => set('backup', { time }))),
        ];
    }
  }

  const cards = REMINDER_KINDS.map((kind) => {
    const body = h('div', { className: 'notify-body', hidden: !settings[kind].on }, ...controls(kind, settings));
    return h(
      'section',
      { className: 'notify-card' },
      h(
        'label',
        { className: 'checkbox notify-toggle' },
        h('input', {
          type: 'checkbox',
          checked: settings[kind].on,
          onchange: async (event: Event) => {
            settings[kind].on = (event.target as HTMLInputElement).checked;
            body.hidden = !settings[kind].on;
            await save();
            await showPermission();
          },
        }),
        h('span', {}, h('strong', {}, t(`notify.${kind}`)), h('span', { className: 'hint-inline' }, t(`notify.${kind}Hint`))),
      ),
      body,
    );
  });

  root.replaceChildren(
    h(
      'div',
      { className: 'screen' },
      h('h1', {}, t('notify.title')),
      status,
      ...cards,
      h('button', { type: 'button', className: 'button button-secondary bottom-action', onclick: onBack }, t('common.back')),
    ),
  );
  await showPermission();
}
