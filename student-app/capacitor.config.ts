/**
 * Capacitor config for Android/iOS builds.
 * Install: npm i -D @capacitor/cli @capacitor/core && npx cap add android|ios
 */
const config = {
  appId: 'edu.avichian.app',
  appName: 'Avichian',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
