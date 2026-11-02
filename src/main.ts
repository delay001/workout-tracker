import './style.css';
import { requestPersistentStorage } from './db';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  app.innerHTML = '<h1>Трекер тренировок</h1>';
}

void requestPersistentStorage();
