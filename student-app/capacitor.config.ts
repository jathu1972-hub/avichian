/**
 * Capacitor config for Android/iOS builds.
 *
 * Startup flow (Android):
 * 1) Android 12+ system splash — dark bg + icon only (API restriction: no multi-line text)
 * 2) Native MainActivity branding overlay — logo + AVICHIAN + Designed & Developed by Jathurshan
 * 3) WebView / React app when ready
 *
 * Do not rely on React HTML for the first native frame.
 */
const config = {
  appId: 'edu.avichian.app',
  appName: 'AVICHIAN',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      // System/Capacitor splash: dark only; full credit is native overlay in MainActivity
      backgroundColor: '#09090b',
      launchAutoHide: true,
      launchShowDuration: 0,
      showSpinner: false,
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
