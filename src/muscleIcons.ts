import type { GroupKey } from './catalog';
import { EXERCISE_ICONS } from './exerciseIcons';

// Значки групп мышц: тонкие линии, цвет берется из текста (currentColor).
// Человечки показывают упражнение на эту мышцу; голова — кружок.
const head = (x: number, y: number): string => `<circle cx="${x}" cy="${y}" r="2"/>`;
const legs = 'M12 15l-2.5 6M12 15l2.5 6';

const ICONS: Record<GroupKey, string> = {
  // Жим лежа: скамья, лежащий человек, штанга над грудью
  chest: `<path d="M2 18h15M4 18v3M15 18v3M5 15h10M10 15V8M4 8h12M5 5.5v5M15 5.5v5"/>${head(18, 15)}`,
  // Подтягивания: перекладина, руки вверх
  lats: `<path d="M3 3h18M7 3l2 7h6l2-7M12 10v5${legs}"/>${head(12, 7)}`,
  // Шраги: плечи вверх, гантели в опущенных руках
  traps: `<path d="M7 10l5-2 5 2M12 8v7M7 10v6M17 10v6M5 16h4M15 16h4${legs}"/>${head(12, 4)}`,
  // Жим гантелей над головой
  frontDelt: `<path d="M6 3v6h12V3M4 3h4M16 3h4M12 9v6${legs}"/>${head(12, 5.5)}`,
  // Махи в стороны
  sideDelt: `<path d="M3 9h18M3 7v4M21 7v4M12 6v9${legs}"/>${head(12, 3.5)}`,
  // Махи в наклоне: корпус наклонен, руки идут назад-вверх
  rearDelt: `<path d="M5 12l10-3M5 12l-1 9M5 12l2 9M13 9.5l2 5M13 9.5l3-5"/>${head(17.5, 8.5)}`,
  // Согнутая рука
  biceps: `<path d="M4 20c1-6 3-10 7-13 2-1.5 4-.5 3.5 1.5L13 11c3-1 6 0 7 3 .8 2.5-1 5-4 6z"/><path d="M10 14c1.5-1 3.5-1 5 .5"/>`,
  // Разгибание на блоке: трос сверху, рука уходит вниз
  triceps: `<path d="M16 2v8M13 10h6M8 6l2 6 3-2M10 12v4M8 21l2-5 2 5"/>${head(7, 4)}`,
  // Кулак и запястье
  forearms: `<path d="M8 21v-6M16 21v-6M7 15h10l1-6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2z"/><path d="M9 7v3M12 7v3M15 7v3"/>`,
  // Приседание со штангой на плечах
  quads: `<path d="M5 6h14M5 4v4M19 4v4M9 6h6M12 6v6l-5 2 2 7M12 12l5 2-2 7"/>${head(12, 3)}`,
  // Румынская тяга: наклон с прямыми ногами, штанга у голеней
  hamstrings: `<path d="M8 12l9-4M8 12v9M15 9v8M12 17h7M12 15v4M19 15v4"/>${head(19, 6.5)}`,
  // Ягодичный мост
  glutes: `<path d="M3 19h18M6 19l3-6 6 0 3 6M9 13l-3-2"/>${head(4, 11)}`,
  // Подъем на носки: голень с икрой, стрелка вверх
  calves: `<path d="M9 2c0 4-1 6-1 9 0 2 1 3 1 5l-1 4h6l-2-3c0-3 2-5 2-8 0-2-1-4-1-7M19 12V6M17 8l2-2 2 2"/>`,
  // Пресс: кубики
  abs: `<rect x="6" y="3" width="12" height="18" rx="4"/><path d="M12 3v18M6 9h12M6 15h12"/>`,
  // Сердце с пульсом
  cardio: `<path d="M12 20s-8-4.5-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.5 12 20 12 20z"/><path d="M5 12h4l1.5-2.5 2 5 1.5-2.5h5"/>`,
  // Без группы: гантель
  none: `<path d="M6 8v8M9 6v12M15 6v12M18 8v8M9 12h6M3 12h3M18 12h3"/>`,
};

// У упражнения каталога свой значок, у своего упражнения пользователя — значок группы
export function muscleIcon(key: GroupKey, name = ''): HTMLElement {
  const icon = document.createElement('span');
  icon.className = 'muscle-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${EXERCISE_ICONS[name] ?? ICONS[key]}</svg>`;
  return icon;
}

// Кнопка списка упражнений со значком слева
export function withMuscleIcon<T extends HTMLElement>(element: T, key: GroupKey, name: string): T {
  element.classList.add('has-muscle-icon');
  element.prepend(muscleIcon(key, name));
  return element;
}
