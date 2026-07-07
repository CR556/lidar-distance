import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isLidarSupported, isTrueDepthSupported } from './modules/lidar-measure';
import { UnsupportedDevice } from './src/components/UnsupportedDevice';
import { MeasureScreen } from './src/screens/MeasureScreen';

function detectCapabilities() {
  try {
    return { lidar: isLidarSupported(), trueDepth: isTrueDepthSupported() };
  } catch {
    // Native module missing (e.g. Expo Go) — treat as unsupported.
    return { lidar: false, trueDepth: false };
  }
}

const capabilities = detectCapabilities();

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {capabilities.lidar ? (
        <MeasureScreen />
      ) : capabilities.trueDepth ? (
        <MeasureScreen frontOnly />
      ) : (
        <UnsupportedDevice />
      )}
    </SafeAreaProvider>
  );
}
