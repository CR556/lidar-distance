import { requireNativeView } from 'expo';
import * as React from 'react';

import type { LidarMeasureViewProps, LidarMeasureViewRef } from './LidarMeasure.types';

const NativeView = requireNativeView<
  LidarMeasureViewProps & { ref?: React.Ref<LidarMeasureViewRef> }
>('LidarMeasure');

export const LidarMeasureView = React.forwardRef<LidarMeasureViewRef, LidarMeasureViewProps>(
  function LidarMeasureView(props, ref) {
    return <NativeView {...props} ref={ref} />;
  }
);
