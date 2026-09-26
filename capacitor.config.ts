import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.cardpulse.app',
  appName: 'CardPulse',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: {
    // Android 15 draws the app under the status bar: Capacitor sets --safe-area-inset-* (styles.css reads them), and
    // knowing the page asks for viewport-fit=cover up front avoids a layout jump on start
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
  },
}

export default config
