import { backButton, h } from './dom';
import { t, type MessageKey } from './i18n';

// Справка «Как считается»: формулы и правила показателей, по одному разделу на показатель
const SECTIONS: [MessageKey, MessageKey][] = [
  ['help.oneRepMax', 'help.oneRepMaxText'],
  ['help.tonnage', 'help.tonnageText'],
  ['help.records', 'help.recordsText'],
  ['help.plateau', 'help.plateauText'],
  ['help.levels', 'help.levelsText'],
  ['help.volume', 'help.volumeText'],
];

export function renderHelpScreen(root: HTMLElement, onBack: () => void): void {
  root.replaceChildren(
    h(
      'div',
      { className: 'screen' },
      h('h1', {}, t('help.title')),
      ...SECTIONS.map(([title, text]) =>
        h('section', { className: 'help-card' }, h('h2', {}, t(title)), h('p', {}, t(text))),
      ),
      backButton(onBack),
    ),
  );
}
