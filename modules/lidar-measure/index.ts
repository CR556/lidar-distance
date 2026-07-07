import LidarMeasureModule from './src/LidarMeasureModule';

export { LidarMeasureView } from './src/LidarMeasureView';
export * from './src/LidarMeasure.types';

export function isLidarSupported(): boolean {
  return LidarMeasureModule.isLidarSupported();
}

export function isTrueDepthSupported(): boolean {
  return LidarMeasureModule.isTrueDepthSupported();
}
