import { NativeModule, requireNativeModule } from 'expo';

declare class LidarMeasureNativeModule extends NativeModule {
  isLidarSupported(): boolean;
  isTrueDepthSupported(): boolean;
}

export default requireNativeModule<LidarMeasureNativeModule>('LidarMeasure');
