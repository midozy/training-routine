import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elsamman.heavy',
  appName: 'Heavy',
  webDir: 'out',
  ios: {
    contentInset: 'never',
    backgroundColor: '#f4f1ea',
  },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#d7ff3a', showSpinner: false },
    LocalNotifications: { presentationOptions: [] }, // in-app timer handles the foreground; alert shows when locked/backgrounded
  },
};

export default config;
