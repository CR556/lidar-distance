import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LidarMeasureView,
  LidarMeasureViewRef,
  MeasureErrorEvent,
  MeasureMode,
  TrackingStateEvent,
} from '../../modules/lidar-measure';
import { CrosshairOverlay } from '../components/CrosshairOverlay';
import { DebugOverlay } from '../components/DebugOverlay';
import { DistanceReadout } from '../components/DistanceReadout';
import { ModeSwitcher } from '../components/ModeSwitcher';
import { UnitToggle } from '../components/UnitToggle';
import { useDistanceFeed } from '../hooks/useDistanceFeed';
import { useUnits } from '../hooks/useUnits';

const TRIPLE_TAP_WINDOW_MS = 600;
const TOAST_DURATION_MS = 1800;

type Props = {
  /** Device has TrueDepth but no LiDAR: hide the rear modes. */
  frontOnly?: boolean;
};

export function MeasureScreen({ frontOnly = false }: Props) {
  const insets = useSafeAreaInsets();
  const viewRef = useRef<LidarMeasureViewRef>(null);

  const availableModes: MeasureMode[] = frontOnly
    ? ['front']
    : ['rearTap', 'rearCrosshair', 'front'];
  const [mode, setMode] = useState<MeasureMode>(frontOnly ? 'front' : 'rearCrosshair');
  const { unit, cycleUnit } = useUnits();
  const { event, stale, onDistance, reset } = useDistanceFeed();
  const [tracking, setTracking] = useState<TrackingStateEvent>({ state: 'initializing' });
  const [lastError, setLastError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const [hasAnchors, setHasAnchors] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readoutTaps = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  const changeMode = useCallback(
    (next: MeasureMode) => {
      setMode(next);
      reset();
      setHasAnchors(false);
      if (next === 'front') {
        showToast('Front sensor range ≈ 0.2–1.2 m');
      }
    },
    [reset, showToast]
  );

  const handleTrackingState = useCallback(
    (e: { nativeEvent: TrackingStateEvent }) => setTracking(e.nativeEvent),
    []
  );

  const handleError = useCallback(
    (e: { nativeEvent: MeasureErrorEvent }) => {
      setLastError(`${e.nativeEvent.code}: ${e.nativeEvent.message}`);
      showToast(e.nativeEvent.message);
    },
    [showToast]
  );

  // Triple-tap the readout to toggle the debug overlay.
  const handleReadoutPress = useCallback(() => {
    const now = Date.now();
    readoutTaps.current = [...readoutTaps.current, now].filter(
      (t) => now - t < TRIPLE_TAP_WINDOW_MS
    );
    if (readoutTaps.current.length >= 3) {
      readoutTaps.current = [];
      setDebugVisible((visible) => !visible);
    }
  }, []);

  const handleTap = useCallback(
    async (evt: GestureResponderEvent) => {
      if (mode !== 'rearTap') return;
      const { locationX, locationY } = evt.nativeEvent;
      try {
        const result = await viewRef.current?.measureAtPoint(locationX, locationY);
        if (result) {
          setHasAnchors(true);
        } else {
          showToast('No surface found — try again');
        }
      } catch (error) {
        showToast('Measurement failed');
        setLastError(String(error));
      }
    },
    [mode, showToast]
  );

  const handleClear = useCallback(async () => {
    await viewRef.current?.clearAnchors().catch(() => {});
    setHasAnchors(false);
    reset();
  }, [reset]);

  return (
    <View style={styles.container}>
      <LidarMeasureView
        ref={viewRef}
        style={StyleSheet.absoluteFill}
        mode={mode}
        updateHz={15}
        smoothing={{ medianWindow: 5, emaAlpha: 0.3 }}
        showNativeMarkers
        onDistance={onDistance}
        onTrackingState={handleTrackingState}
        onError={handleError}
      />

      {mode === 'rearTap' && (
        <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />
      )}

      {(mode === 'rearCrosshair' || mode === 'front') && <CrosshairOverlay />}

      <DistanceReadout
        meters={event?.meters ?? null}
        confidence={event?.confidence ?? null}
        stale={stale}
        unit={unit}
        tracking={tracking}
        onPress={handleReadoutPress}
      />

      {debugVisible && <DebugOverlay event={event} tracking={tracking} lastError={lastError} />}

      {toast && (
        <View style={[styles.toast, { bottom: insets.bottom + 96 }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <View style={[styles.bottomBar, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <ModeSwitcher mode={mode} availableModes={availableModes} onChange={changeMode} />
        <UnitToggle unit={unit} onPress={cycleUnit} />
        {mode === 'rearTap' && hasAnchors && (
          <Pressable onPress={handleClear} style={styles.clearButton}>
            <Text style={styles.clearLabel}>Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  clearButton: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  clearLabel: {
    color: '#ff9f0a',
    fontSize: 15,
    fontWeight: '600',
  },
  toast: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  toastText: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
