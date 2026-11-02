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
  const toast = h('div', { className: 'toast', role: 'status' }, text);
  document.body.append(toast);
  setTimeout(() => toast.remove(), 4000);
}

export function field(label: string, control: HTMLElement): HTMLLabelElement {
  return h('label', { className: 'field' }, h('span', {}, label), control);
}
