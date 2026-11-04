import './style.css';
import { markUpExercises, requestPersistentStorage, type Workout } from './db';
import { h, startCustomSelects } from './dom';
import { renderHistoryTab, resetHistoryMonth } from './historyScreen';
import { renderHomeScreen } from './homeScreen';
import { getSetting, loadTheme } from './settings';
import { startHaptics } from './haptics';
import { mountMascot, parseMascot } from './mascot';
import { syncAchievements } from './motivationScreens';
import { needsOnboarding, renderOnboarding } from './onboarding';
import { renderSettingsScreen } from './settingsScreen';
import { renderStatsScreen } from './statsScreen';
import { renderWorkoutScreen } from './workoutScreen';
import { getActiveWorkout } from './workouts';
import { t } from './i18n';

type Tab = 'workout' | 'history' | 'stats' | 'settings';

const TABS: [Tab, string, string][] = [
  [
    'workout',
    t('tab.workout'),
    '<path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12"/>',
  ],
  [
    'history',
    t('tab.history'),
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ],
  ['stats', t('tab.stats'), '<path d="M4 20h16M7 20v-7M12 20V5M17 20v-10"/>'],
  // Настройки открываются по нажатию на аватар на главном экране, поэтому в панели их нет
];

const app = document.querySelector<HTMLDivElement>('#app');
const content = h('main', { className: 'tab-content' });

function appear(element: HTMLElement): void {
  element.animate(
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 220, easing: 'ease-out' },
  );
}

async function showTab(tab: Tab, message = ''): Promise<void> {
  if (!app) {
    return;
  }

  const buttons = TABS.map(([id, label, icon]) => {
    const button = h(
      'button',
      {
        type: 'button',
        className: id === tab ? 'tab tab-active' : 'tab',
        onclick: () => {
          if (id === 'history') {
            resetHistoryMonth();
          }
          void showTab(id);
        },
      },
      label,
    );
    button.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`);
    return button;
  });
  const bar = h('nav', { className: 'tabs' }, ...buttons);
  app.replaceChildren(content, bar);
  // Маскот живет только на первой вкладке
  if (tab === 'workout') {
    if ((await getSetting('mascotOff')) !== 'yes') {
      mountMascot(bar, parseMascot(await getSetting('mascot')));
    }
  }

  if (tab === 'workout') {
    await renderHomeScreen(content, await getActiveWorkout(), () => void openActive(), () => void showTab('stats'), () => void showTab('settings'));
  } else if (tab === 'history') {
    await renderHistoryTab(
      content,
      (opened) => {
        void openWorkout(opened, () => void showTab('history'));
      },
      () => void showTab('settings'),
    );
  } else if (tab === 'stats') {
    await renderStatsScreen(content, () => void showTab('settings'));
  } else {
    await renderSettingsScreen(content, message, (result) => void showTab('settings', result));
  }
  appear(content);
}

async function openWorkout(workout: Workout, onClosed: () => void): Promise<void> {
  if (app) {
    await renderWorkoutScreen(app, workout, onClosed);
    appear(app);
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

void loadTheme()
  .then(startHaptics)
  .then(startCustomSelects)
  .then(markUpExercises)
  .then(() => syncAchievements(false))
  .then(needsOnboarding)
  .then((needed) => {
    if (needed && app) {
      void renderOnboarding(app, () => void openActive());
    } else {
      void openActive();
    }
  });
void requestPersistentStorage();
