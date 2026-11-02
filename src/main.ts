import './style.css';
import { requestPersistentStorage, type Workout } from './db';
import { h } from './dom';
import { renderHistoryTab } from './historyScreen';
import { renderHomeScreen } from './homeScreen';
import { renderSettingsScreen } from './settingsScreen';
import { renderWorkoutScreen } from './workoutScreen';
import { getActiveWorkout } from './workouts';

type Tab = 'workout' | 'history' | 'settings';

const TABS: [Tab, string][] = [
  ['workout', 'Тренировка'],
  ['history', 'История'],
  ['settings', 'Настройки'],
];

const app = document.querySelector<HTMLDivElement>('#app');
const content = h('main', { className: 'tab-content' });

async function showTab(tab: Tab, message = ''): Promise<void> {
  if (!app) {
    return;
  }

  const buttons = TABS.map(([id, label]) =>
    h(
      'button',
      {
        type: 'button',
        className: id === tab ? 'tab tab-active' : 'tab',
        onclick: () => void showTab(id),
      },
      label,
    ),
  );
  app.replaceChildren(content, h('nav', { className: 'tabs' }, ...buttons));

  if (tab === 'workout') {
    renderHomeScreen(content, await getActiveWorkout(), () => void openActive());
  } else if (tab === 'history') {
    await renderHistoryTab(content, (opened) => {
      void openWorkout(opened, () => void showTab('history'));
    });
  } else {
    renderSettingsScreen(content, message, (result) => void showTab('settings', result));
  }
}

async function openWorkout(workout: Workout, onClosed: () => void): Promise<void> {
  if (app) {
    await renderWorkoutScreen(app, workout, onClosed);
  }
}

// Начатая тренировка хранится в базе, поэтому при запуске открывается снова
async function openActive(): Promise<void> {
  const workout = await getActiveWorkout();
  if (workout) {
    await openWorkout(workout, () => void showTab('workout'));
  } else {
    await showTab('workout');
  }
}

void openActive();
void requestPersistentStorage();
