import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'live.schoolportal.app',
  appName: 'SchoolOS',
  webDir: 'dist',
  server: {
    // In production, the app loads from the bundled dist folder
    // For development, uncomment the line below to use live reload:
    // url: 'http://192.168.x.x:5173',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#2563eb',
      showSpinner: false,
    },
    BiometricAuth: {
      // Will use fingerprint or face unlock
    },
    Camera: {
      // For document scanning
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false, // Set true for dev
  },
};

export default config;
