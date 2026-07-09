import LidarMeasureModule from './src/LidarMeasureModule';

export { LidarMeasureView } from './src/LidarMeasureView';
export * from './src/LidarMeasure.types';

export function isLidarSupported(): boolean {
  return LidarMeasureModule.isLidarSupported();
}

export function isTrueDepthSupported(): boolean {
  return LidarMeasureModule.isTrueDepthSupported();
}

export function saveImageToPhotos(
  path: string,
  userComment: string,
  imageDescription: string
): Promise<void> {
  return LidarMeasureModule.saveImageToPhotos(path, userComment, imageDescription);
}
