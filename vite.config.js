import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// VITE_BASE_PATH is injected by the GitHub Actions workflow so the app
// works at https://<user>.github.io/<repo-name>/ without hardcoding the
// repo name here. Defaults to '/' for local dev.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Home Darts Scorer',
        short_name: 'Darts',
        description: '501, 301 and Round the Clock darts scoring for home play',
        theme_color: '#111318',
        background_color: '#111318',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
})
