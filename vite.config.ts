import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Static assets only: the generated service worker precaches the build
      // output and never registers a runtime route, so Convex traffic (a
      // cross-origin API) is never cached.
      manifest: {
        name: 'Familienapp',
        short_name: 'Familie',
        description: 'Familien-Organisation: Aufgaben, Punkte und Belohnungen.',
        lang: 'de',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Theme colours from src/index.css :root
        // (--primary = oklch(0.205 0 0), --background = oklch(1 0 0)).
        theme_color: '#171717',
        background_color: '#ffffff',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff,woff2}'],
        navigateFallback: '/index.html',
        // Push/notificationclick handlers live in this plain script; it is
        // importScripted into the generated sw.js and adds no fetch handler.
        importScripts: ['/push-sw.js'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
