import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Две сборки из одного кода:
// - обычная (npm run build) — сайт на GitHub Pages с service worker, папка dist;
// - apk (npm run build:apk) — приложение внутри apk: относительные пути, без service worker, папка dist-apk.
export default defineConfig(({ mode }) => {
  if (mode === 'apk') {
    return {
      base: './',
      build: { outDir: 'dist-apk' },
    };
  }
  return {
    // Приложение живёт в подпапке: delay001.github.io/workout-tracker/
    base: '/workout-tracker/',
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,png}'],
        },
        manifest: {
          name: 'Трекер тренировок',
          short_name: 'Тренировки',
          description: 'Запись силовых тренировок',
          lang: 'ru',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#17151f',
          theme_color: '#17151f',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
  };
});
