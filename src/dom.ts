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

export function field(label: string, control: HTMLElement): HTMLLabelElement {
  return h('label', { className: 'field' }, h('span', {}, label), control);
}
