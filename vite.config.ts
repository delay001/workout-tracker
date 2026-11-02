import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
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
});
