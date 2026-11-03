import { t } from './i18n';

// Создаёт элемент. Текст вставляется как текст, поэтому название упражнения не сломает страницу.
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

// Своё окно подтверждения: стандартное окно браузера встроенные браузеры и PWA иногда блокируют
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
