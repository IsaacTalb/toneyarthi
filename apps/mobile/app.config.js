import { generateExpoAssets } from './scripts/generate-expo-assets.mjs';

const productionBundleIdentifier = 'com.toneyarthi.mobile';

export default ({ config }) => {
  generateExpoAssets();

  const profile = process.env.EAS_BUILD_PROFILE ?? 'development';
  const isProduction = profile === 'production';
  const isDevelopment = profile === 'development';

  return {
    ...config,
    name: isProduction ? 'Tone Yar Thi' : 'Tone Yar Thi Preview',
    slug: 'tone-yar-thi',
    version: '0.1.0',
    runtimeVersion: { policy: 'appVersion' },
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'toneyarthi',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#F8F6F0',
          image: './assets/splash-icon.png',
          imageWidth: 180,
          resizeMode: 'contain',
          dark: {
            backgroundColor: '#18251D',
            image: './assets/splash-icon-dark.png',
          },
        },
      ],
      ['expo-audio', { microphonePermission: false }],
      ['expo-notifications', { defaultChannel: 'news' }],
    ],
    experiments: { typedRoutes: true },
    ios: {
      supportsTablet: true,
      bundleIdentifier: isProduction
        ? productionBundleIdentifier
        : `${productionBundleIdentifier}.preview`,
      buildNumber: '1',
      icon: './assets/icon.png',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ['audio'],
      },
      entitlements: {
        'aps-environment': isDevelopment ? 'development' : 'production',
      },
    },
    android: {
      package: productionBundleIdentifier,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#F8F6F0',
      },
      permissions: [
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
        'android.permission.WAKE_LOCK',
      ],
    },
  };
};
