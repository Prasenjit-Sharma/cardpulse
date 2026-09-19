import basicSsl from '@vitejs/plugin-basic-ssl'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Set VITE_BASE=/repo-name/ when deploying under a sub-path (e.g. GitHub Pages project sites).
const base = process.env.VITE_BASE ?? '/'
const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    basicSsl(), // self-signed https for dev/preview so the in-app camera works on a phone over LAN
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        id: base,
        name: 'CardPulse',
        short_name: 'CardPulse',
        description: 'Scan business cards into contacts. Reads several cards per photo, built for exhibitions.',
        categories: ['business', 'productivity'],
        lang: 'en-IN',
        theme_color: '#0F766E',
        background_color: '#F4F5F6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        shortcuts: [
          { name: 'Scan a card', short_name: 'Scan', url: `${base}?action=scan`, icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,woff2,webmanifest}'], navigateFallback: `${base}index.html`, navigateFallbackDenylist: [/privacy\.html$/] },
    }),
  ],
})
