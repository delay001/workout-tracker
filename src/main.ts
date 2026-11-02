import './style.css';
import { requestPersistentStorage } from './db';
import { renderHomeScreen } from './homeScreen';
import { renderWorkoutScreen } from './workoutScreen';
import { getActiveWorkout } from './workouts';

const app = document.querySelector<HTMLDivElement>('#app');

async function render(message = ''): Promise<void> {
  if (!app) {
    return;
  }

  // Начатая тренировка хранится в базе, поэтому после перезапуска открывается снова
  const workout = await getActiveWorkout();
  if (workout) {
    await renderWorkoutScreen(app, workout, (result) => void render(result));
  } else {
    renderHomeScreen(app, message, () => void render());
  }
}

void render();
void requestPersistentStorage();
