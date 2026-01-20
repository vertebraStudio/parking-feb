import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/parking-feb/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'FEB parking',
        short_name: 'FEB parking',
        description: 'Aplicación de gestión de parking',
        theme_color: '#FF9500',
        background_color: '#111C4E',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/parking-feb/',
        start_url: '/parking-feb/',
        splash_pages: null,
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      injectManifest: {
        // Needed by some setups to avoid ESM SW issues
        rollupFormat: 'iife',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg}'],
      },
      devOptions: {
        enabled: false
      }
    })
  ]
})
