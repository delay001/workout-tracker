import './style.css';
import { renderBackupScreen } from './backupScreen';
import { requestPersistentStorage } from './db';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = '<h1>Трекер тренировок</h1><section id="backup"></section>';
  renderBackupScreen(app.querySelector<HTMLElement>('#backup')!);
}

void requestPersistentStorage();
