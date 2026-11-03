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
export function showToast(text: string): void {
  // Несколько плашек подряд встают друг под другом, а не одна поверх другой
  let stack = document.querySelector<HTMLElement>('.toast-stack');
  if (!stack) {
    stack = h('div', { className: 'toast-stack' });
    document.body.append(stack);
  }
  const toast = h('div', { className: 'toast', role: 'status' }, text);
  stack.append(toast);
  setTimeout(() => toast.remove(), 4000);
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
      className: 'button button-secondary',
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

// Свое окно подтверждения: стандартное окно браузера встроенные браузеры и PWA иногда блокируют
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

export function field(label: string, control: HTMLElement): HTMLLabelElement {
  return h('label', { className: 'field' }, h('span', {}, label), control);
}
