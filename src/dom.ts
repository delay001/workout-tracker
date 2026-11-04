import { formatMonth, monthCells, shiftMonth, todayLocal } from './dates';
import { LOCALE, t } from './i18n';

// Создает элемент. Текст вставляется как текст, поэтому название упражнения не сломает страницу.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.assign(element, props);
  element.append(...children);
  return element;
}

// Заметная плашка поверх экрана, которая исчезает сама
function toastStack(): HTMLElement {
  // Несколько плашек подряд встают друг под другом, а не одна поверх другой
  let stack = document.querySelector<HTMLElement>('.toast-stack');
  if (!stack) {
    stack = h('div', { className: 'toast-stack' });
    document.body.append(stack);
  }
  return stack;
}

export function showToast(text: string): void {
  const toast = h('div', { className: 'toast', role: 'status' }, text);
  toastStack().append(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Плашка «Удалено · Отменить» на 5 секунд: нажатие возвращает удаленное
export function showUndo(text: string, onUndo: () => void | Promise<void>): void {
  const toast = h(
    'div',
    { className: 'toast toast-undo', role: 'status' },
    text,
    h(
      'button',
      {
        type: 'button',
        className: 'toast-action',
        onclick: () => {
          toast.remove();
          void onUndo();
        },
      },
      t('common.undo'),
    ),
  );
  toastStack().append(toast);
  setTimeout(() => toast.remove(), 5000);
}

// Первые строки видны сразу, остальные открываются кнопкой
// open: сразу развернуть, например чтобы было видно выбранную строку
export function collapsible(rows: HTMLElement[], limit = 6, open = false): HTMLElement[] {
  if (rows.length <= limit) return rows;
  const rest = h('div', { hidden: !open }, ...rows.slice(limit));
  const toggle = h(
    'button',
    {
      type: 'button',
      className: 'button button-secondary collapse-toggle',
      onclick: () => {
        rest.hidden = !rest.hidden;
        toggle.textContent = rest.hidden ? t('common.showAll', { count: rows.length }) : t('common.collapse');
      },
    },
    open ? t('common.collapse') : t('common.showAll', { count: rows.length }),
  );
  return [...rows.slice(0, limit), rest, toggle];
}

// Пустой экран: значок, подсказка, что делать дальше, и кнопка, если действие очевидно
export function emptyState(icon: string, text: string, action?: [string, () => void]): HTMLElement {
  return h(
    'div',
    { className: 'empty' },
    h('span', { className: 'empty-icon', ariaHidden: 'true' }, icon),
    h('p', {}, text),
    ...(action ? [h('button', { type: 'button', className: 'button', onclick: action[1] }, action[0])] : []),
  );
}

// Короткий разлет цветных кусочков поверх экрана, например при рекорде
export function confetti(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  const colors = ['#e8528f', '#f0883e', '#3fbf7f', '#5b9df5', '#a970f0', '#f2c94c'];
  const layer = h('div', { className: 'confetti', ariaHidden: 'true' });
  for (let index = 0; index < 40; index++) {
    const piece = h('span');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    piece.style.setProperty('--spin', `${(Math.random() - 0.5) * 1080}deg`);
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2200);
}

export interface YearMonth {
  year: number;
  month: number;
}

// Свое окно выбора месяца: год стрелками, месяцы сеткой 3 × 4. Нажатие на месяц выбирает его и закрывает окно.
export function pickMonth(shown: YearMonth, today: YearMonth): Promise<YearMonth | undefined> {
  return new Promise((resolve) => {
    let year = shown.year;
    const close = (answer?: YearMonth): void => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    const title = h('strong', { className: 'month-dialog-year' });
    const grid = h('div', { className: 'month-dialog-grid' });
    const render = (): void => {
      title.textContent = String(year);
      grid.replaceChildren(
        ...Array.from({ length: 12 }, (_, month) => {
          const name = new Date(2000, month, 1).toLocaleDateString(LOCALE, { month: 'long' });
          const classes = ['month-dialog-month'];
          if (year === shown.year && month === shown.month) classes.push('month-dialog-shown');
          if (year === today.year && month === today.month) classes.push('month-dialog-today');
          return h('button', { type: 'button', className: classes.join(' '), onclick: () => close({ year, month }) }, name);
        }),
      );
    };
    const yearButton = (label: string, name: string, delta: number): HTMLButtonElement =>
      h('button', { type: 'button', className: 'step-button', ariaLabel: name, onclick: () => ((year += delta), render()) }, label);

    const dialog = h(
      'dialog',
      { className: 'confirm-dialog month-dialog' },
      h(
        'div',
        { className: 'month-nav' },
        yearButton('‹', t('common.prevYear'), -1),
        title,
        yearButton('›', t('common.nextYear'), 1),
      ),
      grid,
      h(
        'div',
        { className: 'card-actions' },
        h('button', { type: 'button', className: 'button button-secondary', onclick: () => close() }, t('set.cancel')),
        h('button', { type: 'button', className: 'button', onclick: () => close(today) }, t('common.thisMonth')),
      ),
    );
    dialog.oncancel = (event) => {
      event.preventDefault();
      close();
    };
    // Нажатие мимо окна, на затемнение, закрывает его
    dialog.onclick = (event) => {
      if (event.target === dialog) close();
    };
    render();
    document.body.append(dialog);
    dialog.showModal();
  });
}

// Свое окно выбора дня: месяц стрелками, дни сеткой, как в календаре истории
export function pickDate(value: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const today = todayLocal();
    const start = value || today;
    let shown = { year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) - 1 };
    const close = (answer?: string): void => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    const title = h('strong', { className: 'month-dialog-year' });
    const grid = h('div', { className: 'date-dialog-grid' });
    const weekdays = (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) =>
      h('span', { className: 'weekday' }, t(`weekday.${day}`)),
    );
    const render = (): void => {
      title.textContent = formatMonth(shown.year, shown.month);
      grid.replaceChildren(
        ...weekdays,
        ...monthCells(shown.year, shown.month).map((date) => {
          if (!date) return h('span');
          const classes = ['month-dialog-month'];
          if (date === value) classes.push('month-dialog-shown');
          if (date === today) classes.push('month-dialog-today');
          return h('button', { type: 'button', className: classes.join(' '), onclick: () => close(date) }, String(Number(date.slice(8))));
        }),
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
            render();
          },
        },
        label,
      );

    const dialog = h(
      'dialog',
      { className: 'confirm-dialog month-dialog' },
      h(
        'div',
        { className: 'month-nav' },
        monthButton('‹', t('common.prevMonth'), -1),
        title,
        monthButton('›', t('common.nextMonth'), 1),
      ),
      grid,
      h(
        'div',
        { className: 'card-actions' },
        h('button', { type: 'button', className: 'button button-secondary', onclick: () => close() }, t('set.cancel')),
        h('button', { type: 'button', className: 'button', onclick: () => close(today) }, t('common.today')),
      ),
    );
    dialog.oncancel = (event) => {
      event.preventDefault();
      close();
    };
    dialog.onclick = (event) => {
      if (event.target === dialog) close();
    };
    render();
    document.body.append(dialog);
    dialog.showModal();
  });
}

// Поле даты открывает свое окно вместо системного. Само поле остается, поэтому value читается как раньше.
export function dateField(input: HTMLInputElement): HTMLElement {
  input.tabIndex = -1;
  input.classList.add('date-input');
  // label повторяет нажатие на самом поле, и браузер открыл бы еще и системный календарь: запрещаем
  input.addEventListener('click', (event) => event.preventDefault());
  const open = async (): Promise<void> => {
    const picked = await pickDate(input.value);
    if (picked) {
      input.value = picked;
      input.dispatchEvent(new Event('change'));
    }
  };
  return h(
    'div',
    {
      className: 'date-field',
      role: 'button',
      tabIndex: 0,
      ariaLabel: t('common.pickDate'),
      // Поле лежит внутри label, и label повторяет нажатие на самом поле: второй раз окно не открываем
      onclick: (event: MouseEvent) => {
        if (event.target !== input) void open();
      },
      onkeydown: (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void open();
        }
      },
    },
    input,
  );
}

// Свое окно подтверждения: стандартное окно браузера встроенные браузеры и PWA иногда блокируют
// Список с заголовками групп: заголовок ставится там, где меняется группа
export function groupedList<T>(
  items: T[],
  groupOf: (item: T) => string,
  render: (item: T) => HTMLElement,
): HTMLElement[] {
  const result: HTMLElement[] = [];
  let lastGroup: string | undefined;
  for (const item of items) {
    const group = groupOf(item);
    if (group !== lastGroup) {
      result.push(h('h2', { className: 'group-heading' }, group));
      lastGroup = group;
    }
    result.push(render(item));
  }
  return result;
}

// Ручка ⋮⋮: тянешь — элемент меняется местами с соседями, отпустил — вызывается onDrop
export function dragHandle(item: HTMLElement, label: string, onDrop: () => void): HTMLElement {
  item.dataset.sortable = '';
  const isSortable = (el: Element | null): el is HTMLElement =>
    el instanceof HTMLElement && el.dataset.sortable !== undefined;
  const middle = (el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    return rect.top + rect.height / 2;
  };
  const handle = h('span', { className: 'drag-handle', role: 'img', ariaLabel: label }, '⋮⋮');
  handle.onpointerdown = (down: PointerEvent) => {
    down.preventDefault();
    item.classList.add('dragging');
    // Слушаем все окно: при перестановке элемента браузер теряет захват пальца
    const move = (event: PointerEvent): void => {
      let prev = item.previousElementSibling;
      let next = item.nextElementSibling;
      while (isSortable(prev) && event.clientY < middle(prev)) {
        prev.before(item);
        prev = item.previousElementSibling;
      }
      while (isSortable(next) && event.clientY > middle(next)) {
        next.after(item);
        next = item.nextElementSibling;
      }
      // Длинный список: у края экрана он прокручивается сам
      if (event.clientY < 60) scrollBy(0, -12);
      if (event.clientY > innerHeight - 60) scrollBy(0, 12);
    };
    const drop = (): void => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', drop);
      removeEventListener('pointercancel', drop);
      item.classList.remove('dragging');
      onDrop();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', drop);
    addEventListener('pointercancel', drop);
  };
  return handle;
}

export function confirmDialog(text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (answer: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };
    const dialog = h(
      'dialog',
      { className: 'confirm-dialog' },
      h('p', {}, text),
      h(
        'div',
        { className: 'card-actions' },
        h('button', { type: 'button', className: 'button button-secondary', onclick: () => close(false) }, t('set.cancel')),
        h('button', { type: 'button', className: 'button', onclick: () => close(true) }, t('common.yes')),
      ),
    );
    dialog.oncancel = (event) => {
      event.preventDefault();
      close(false);
    };
    document.body.append(dialog);
    dialog.showModal();
  });
}

// required: красная звездочка у подписи обязательного поля
export function field(label: string, control: HTMLElement, required = false): HTMLLabelElement {
  return h('label', { className: 'field' }, h('span', {}, label, ...(required ? [requiredMark()] : [])), control);
}

export function requiredMark(): HTMLElement {
  return h('b', { className: 'required-mark', ariaHidden: 'true' }, ' *');
}
