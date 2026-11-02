import './style.css';
import { requestPersistentStorage, type Workout } from './db';
import { renderExercisesScreen } from './exercisesScreen';
import { renderHistoryScreen } from './historyScreen';
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
    renderHomeScreen(
      app,
      message,
      () => void render(),
      () => void showHistory(),
      () => void showExercises(),
      (result) => void render(result),
    );
  }
}

async function showExercises(): Promise<void> {
  if (app) {
    await renderExercisesScreen(app, () => void render());
  }
}

async function showHistory(): Promise<void> {
  if (app) {
    await renderHistoryScreen(app, (workout) => void openWorkout(workout), () => void render());
  }
}

async function openWorkout(workout: Workout): Promise<void> {
  if (app) {
    await renderWorkoutScreen(app, workout, () => void showHistory());
  }
}

void render();
void requestPersistentStorage();
