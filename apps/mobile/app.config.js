import { generateExpoAssets } from './scripts/generate-expo-assets.mjs';

const productionBundleIdentifier = 'com.toneyarthi.mobile';
const androidVersionCode = 1;

export default ({ config }) => {
  generateExpoAssets();

  const profile = process.env.EAS_BUILD_PROFILE ?? 'development';
  const isProduction = profile === 'production';
  const isDevelopment = profile === 'development';
  const applicationId = isProduction
    ? productionBundleIdentifier
    : `${productionBundleIdentifier}.preview`;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

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
      bundleIdentifier: applicationId,
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
      package: applicationId,
      versionCode: androidVersionCode,
      icon: './assets/icon.png',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#F8F6F0',
      },
      ...(googleServicesFile ? { googleServicesFile } : {}),
      permissions: [
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
        'android.permission.WAKE_LOCK',
      ],
    },
  };
};
