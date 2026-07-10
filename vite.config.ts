import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/workout/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'The Dunk Project',
        short_name: 'Dunk Project',
        description: 'Twenty focused minutes. One durable year.',
        theme_color: '#171915',
        background_color: '#f2eee5',
        display: 'standalone',
        start_url: '/workout/',
        scope: '/workout/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/workout/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,webmanifest}']
      }
    })
  ],
  test: {
    environment: 'node'
  }
});
