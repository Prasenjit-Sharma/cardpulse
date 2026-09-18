import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Set VITE_BASE=/repo-name/ when deploying under a sub-path (e.g. GitHub Pages project sites).
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [
    basicSsl(), // self-signed https for dev/preview so the in-app camera works on a phone over LAN
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'CardPulse',
        short_name: 'CardPulse',
        description: 'Business card extraction lab — multi-contact, India-ready.',
        theme_color: '#2f6fed',
        background_color: '#f6f7f9',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
