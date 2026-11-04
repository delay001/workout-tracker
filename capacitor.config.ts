import type { CapacitorConfig } from '@capacitor/cli';

// Настройки apk-версии. Веб-часть берется из отдельной сборки npm run build:apk (папка dist-apk),
// сайт на GitHub Pages от этого не зависит.
const config: CapacitorConfig = {
  // Постоянный идентификатор приложения: по нему Android понимает, что новая версия — обновление старой
  appId: 'io.github.delay001.workouttracker',
  appName: 'Трекер тренировок',
  webDir: 'dist-apk',
  backgroundColor: '#17151f',
  android: {
    backgroundColor: '#17151f',
  },
};

export default config;
