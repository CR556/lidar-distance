import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'LiDAR Distance',
  slug: 'lidar-distance',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: 'com.curtriley.lidardistance',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        'The camera and LiDAR sensor are used to measure the distance to objects you point at or tap.',
    },
  },
  plugins: ['expo-build-properties'],
  // Bump whenever native code changes so OTA updates never land on an
  // incompatible binary.
  runtimeVersion: { policy: 'appVersion' },
  // `eas update:configure` fills in updates.url once the EAS project exists.
};

export default config;
