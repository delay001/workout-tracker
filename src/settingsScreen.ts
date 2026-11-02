import { renderBackupScreen } from './backupScreen';
import { h } from './dom';

export function renderSettingsScreen(
  root: HTMLElement,
  message: string,
  onImported: (message: string) => void,
): void {
  const backup = h('section');

  root.replaceChildren(
    h('h1', {}, 'Настройки'),
    h('p', { className: 'status', role: 'status' }, message),
    backup,
  );
  renderBackupScreen(backup, onImported);
}
