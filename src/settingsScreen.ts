import { renderBackupScreen } from './backupScreen';
import { h } from './dom';
import { renderExerciseSettings } from './exerciseSettingsScreen';

export function renderSettingsScreen(
  root: HTMLElement,
  message: string,
  onImported: (message: string) => void,
): void {
  function showMain(): void {
    const backup = h('section');

    root.replaceChildren(
      h('h1', {}, 'Настройки'),
      h('p', { className: 'status', role: 'status' }, message),
      h(
        'button',
        {
          type: 'button',
          className: 'button button-secondary',
          onclick: () => void renderExerciseSettings(root, showMain),
        },
        'Упражнения',
      ),
      backup,
    );
    renderBackupScreen(backup, onImported);
  }

  showMain();
}
