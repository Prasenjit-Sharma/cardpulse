import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.cardpulse.app',
  appName: 'Pulse',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  plugins: {
    // Android 15 draws the app under the status bar: Capacitor sets --safe-area-inset-* (styles.css reads them), and
    // knowing the page asks for viewport-fit=cover up front avoids a layout jump on start
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
    // Android 12+ shows the splash only until the first frame unless something holds it: the app hides it itself once
    // Home or the welcome tour has drawn (platform.ts hideSplash), with a 4 s safety timer in main.tsx. launchShowDuration
    // must be above 0: at 0 the plugin skips the launch splash altogether
    SplashScreen: { launchAutoHide: false, launchShowDuration: 4000, showSpinner: false, backgroundColor: '#F4F4FA' },
  },
}

export default config
