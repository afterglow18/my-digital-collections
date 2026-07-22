import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mydigitalcollections.app',
  appName: 'My Collection',
  webDir: 'dist/public',

  // -------------------------------------------------------------------------
  // iOS-specific configuration
  // -------------------------------------------------------------------------
  ios: {
    // Allow the WKWebView to scroll; the app manages its own scroll areas
    scrollEnabled: true,
    // Prevents white flash on launch
    backgroundColor: '#F9F4EE',
    // Allow inline media playback (used for wardrobe image previews)
    allowsInlineMediaPlayback: true,
    // Info.plist permission strings — all three are required by iOS/TCC.
    // Missing any one causes SIGABRT or silent refusal when the camera/picker opens.
    infoPlist: {
      NSCameraUsageDescription:
        'My Digital Collections needs camera access so you can photograph clothing items and add them to your wardrobe.',
      NSPhotoLibraryUsageDescription:
        'My Digital Collections needs access to your photo library so you can choose existing photos of clothing items.',
      NSPhotoLibraryAddUsageDescription:
        'My Digital Collections saves photos you capture with the camera back to your photo library.',
    },
  },

  plugins: {
    // Keep the splash screen visible until the React app signals it is ready
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#F9F4EE',
      iosSpinnerStyle: 'small',
      showSpinner: false,
    },

    // Overlay the status bar so the cream background shows through the notch
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F9F4EE',
      overlaysWebView: true,
    },
  },
};

export default config;
