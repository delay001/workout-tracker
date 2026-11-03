import { t } from './i18n';

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
