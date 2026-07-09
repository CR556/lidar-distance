import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

import {
  LidarMeasureView,
  LidarMeasureViewRef,
  MeasureErrorEvent,
  MeasureMode,
  ProjectedPointsEvent,
  saveImageToPhotos,
  TrackingStateEvent,
} from '../../modules/lidar-measure';
import { CaptureButton } from '../components/CaptureButton';
import { HeatmapLegend } from '../components/HeatmapLegend';
import { CrosshairOverlay } from '../components/CrosshairOverlay';
import { DebugOverlay } from '../components/DebugOverlay';
import { DistanceReadout } from '../components/DistanceReadout';
import { ModeSwitcher } from '../components/ModeSwitcher';
import { Chain, ChainPoint, ShapesOverlay } from '../components/ShapesOverlay';
import { UnitToggle } from '../components/UnitToggle';
import { useDistanceFeed } from '../hooks/useDistanceFeed';
import { useUnits } from '../hooks/useUnits';
import { buildCaptureMetadata } from '../lib/captureMetadata';
import { formatArea, perimeter, polygonArea } from '../lib/geometry';
import {
  HEATMAP_COLORS,
  HEATMAP_MAX_METERS,
  HEATMAP_MIN_METERS,
  HEATMAP_OPACITY,
} from '../lib/heatmap';
import { projectionStore } from '../lib/projectionStore';
import { formatDistance } from '../lib/units';

const TOAST_DURATION_MS = 1800;
/** Tap within this many points of the first point to snap the shape closed. */
const SNAP_RADIUS = 32;

type Props = {
  /** Device has TrueDepth but no LiDAR: hide the rear modes. */
  frontOnly?: boolean;
};

export function MeasureScreen({ frontOnly = false }: Props) {
  const insets = useSafeAreaInsets();
  const viewRef = useRef<LidarMeasureViewRef>(null);

  const availableModes: MeasureMode[] = frontOnly
    ? ['front']
    : ['rearTap', 'rearCrosshair', 'heatmap', 'front'];
  const [mode, setMode] = useState<MeasureMode>(frontOnly ? 'front' : 'rearCrosshair');
  const { unit, cycleUnit } = useUnits();
  const { event, stale, onDistance, reset } = useDistanceFeed();
  const [tracking, setTracking] = useState<TrackingStateEvent>({ state: 'initializing' });
  const [lastError, setLastError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [flash, setFlash] = useState(false);
  const shotRef = useRef<View>(null);

  // Shape measuring state (rearTap mode). Per-frame projections live in
  // projectionStore, NOT in state — see that module for why.
  const [shapes, setShapes] = useState<Chain[]>([]);
  const [current, setCurrent] = useState<ChainPoint[]>([]);
  // 'shape' = perimeter/area readout; 'camera' = live crosshair distance.
  const [readoutMode, setReadoutMode] = useState<'shape' | 'camera'>('shape');

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleProjectedPoints = useCallback((e: { nativeEvent: ProjectedPointsEvent }) => {
    projectionStore.set(e.nativeEvent.points);
  }, []);

  const closeShape = useCallback(() => {
    setCurrent((points) => {
      if (points.length < 3) return points;
      setShapes((prev) => [...prev, { points, closed: true }]);
      return [];
    });
  }, []);

  const handleTap = useCallback(
    async (evt: GestureResponderEvent) => {
      if (mode !== 'rearTap') return;
      const { locationX, locationY } = evt.nativeEvent;

      // Snap-close when tapping near the first point of the active chain.
      if (current.length >= 3) {
        const first = projectionStore.get()[current[0].id];
        if (
          first?.visible &&
          Math.hypot(locationX - first.x, locationY - first.y) <= SNAP_RADIUS
        ) {
          closeShape();
          return;
        }
      }

      try {
        const result = await viewRef.current?.measureAtPoint(locationX, locationY);
        if (result) {
          setCurrent((prev) => [...prev, { id: result.anchorId, world: result.worldPoint }]);
        } else {
          showToast('No surface found — try again');
        }
      } catch (error) {
        showToast('Measurement failed');
        setLastError(String(error));
      }
    },
    [mode, current, closeShape, showToast]
  );

  // Undo: remove the last pending point; with none pending, re-open the last
  // closed shape (its closing line disappears, points become editable again).
  const handleUndo = useCallback(async () => {
    if (current.length > 0) {
      const last = current[current.length - 1];
      await viewRef.current?.removeAnchor(last.id).catch(() => {});
      setCurrent((prev) => prev.slice(0, -1));
    } else if (shapes.length > 0) {
      const lastShape = shapes[shapes.length - 1];
      setShapes((prev) => prev.slice(0, -1));
      setCurrent(lastShape.points);
    }
  }, [current, shapes]);

  const handleClear = useCallback(async () => {
    await viewRef.current?.clearAnchors().catch(() => {});
    setShapes([]);
    setCurrent([]);
    projectionStore.clear();
    reset();
  }, [reset]);

  // Top readout content in tap mode ('shape' readout): running perimeter of
  // the active chain, or `perimeter · area` of the last closed shape.
  const shapeReadout = useMemo(() => {
    if (mode !== 'rearTap' || readoutMode !== 'shape') return null;
    if (current.length >= 2) {
      return formatDistance(perimeter(current.map((p) => p.world), false), unit);
    }
    if (current.length === 0 && shapes.length > 0) {
      const last = shapes[shapes.length - 1];
      const worlds = last.points.map((p) => p.world);
      return `${formatDistance(perimeter(worlds, true), unit)} · ${formatArea(
        polygonArea(worlds),
        unit
      )}`;
    }
    return current.length === 1 ? 'Tap the next corner…' : 'Tap to place points…';
  }, [mode, readoutMode, current, shapes, unit]);

  const handleReadoutPress = useCallback(() => {
    if (mode === 'rearTap') {
      setReadoutMode((m) => (m === 'shape' ? 'camera' : 'shape'));
    }
  }, [mode]);

  const toggleDebug = useCallback(() => setDebugVisible((v) => !v), []);

  const chainsForOverlay = useMemo<Chain[]>(
    () => [...shapes, ...(current.length > 0 ? [{ points: current, closed: false }] : [])],
    [shapes, current]
  );

  const handleCapture = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    setFlash(true);
    setTimeout(() => setFlash(false), 140);
    try {
      const uri = await captureRef(shotRef, { format: 'jpg', quality: 0.9, result: 'tmpfile' });
      const { userComment, description } = buildCaptureMetadata(chainsForOverlay, {
        mode,
        heatmap:
          mode === 'heatmap'
            ? { minMeters: HEATMAP_MIN_METERS, maxMeters: HEATMAP_MAX_METERS }
            : undefined,
      });
      await saveImageToPhotos(uri, userComment, description);
      showToast('Saved to Photos');
    } catch (error) {
      showToast('Capture failed');
      setLastError(String(error));
    } finally {
      setCapturing(false);
    }
  }, [capturing, chainsForOverlay, mode, showToast]);

  const showCrosshair =
    mode === 'rearCrosshair' ||
    mode === 'front' ||
    mode === 'heatmap' ||
    (mode === 'rearTap' && readoutMode === 'camera');
  const hasAnything = current.length > 0 || shapes.length > 0;

  return (
    <View style={styles.container}>
      {/* Everything inside shotRef ends up in captured photos; UI chrome stays outside. */}
      <View ref={shotRef} style={StyleSheet.absoluteFill} collapsable={false}>
        <LidarMeasureView
          ref={viewRef}
          style={StyleSheet.absoluteFill}
          mode={mode}
          updateHz={30}
          smoothing={{ medianWindow: 5, emaAlpha: 0.3 }}
          showNativeMarkers={false}
          heatmapRange={{ min: HEATMAP_MIN_METERS, max: HEATMAP_MAX_METERS }}
          heatmapOpacity={HEATMAP_OPACITY}
          heatmapColors={HEATMAP_COLORS}
          onDistance={onDistance}
          onTrackingState={handleTrackingState}
          onError={handleError}
          onProjectedPoints={handleProjectedPoints}
        />

        {mode !== 'front' && (
          <ShapesOverlay chains={chainsForOverlay} unit={unit} snapHint={current.length >= 3} />
        )}

        {/* Inside the capture container so heatmap photos include their scale. */}
        {mode === 'heatmap' && <HeatmapLegend unit={unit} />}
      </View>

      {mode === 'rearTap' && (
        <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />
      )}

      {showCrosshair && <CrosshairOverlay />}

      <DistanceReadout
        meters={event?.meters ?? null}
        confidence={event?.confidence ?? null}
        stale={stale}
        unit={unit}
        tracking={tracking}
        onPress={handleReadoutPress}
        onLongPress={toggleDebug}
        overrideText={shapeReadout}
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
      </View>

      {mode === 'rearTap' && hasAnything && (
        <View
          style={[styles.actionBar, { bottom: insets.bottom + 72 }]}
          pointerEvents="box-none"
        >
          <Pressable onPress={handleUndo} style={styles.actionButton}>
            <Text style={styles.actionLabel}>Undo</Text>
          </Pressable>
          {current.length >= 3 && (
            <Pressable onPress={closeShape} style={styles.actionButton}>
              <Text style={[styles.actionLabel, styles.closeLabel]}>Close</Text>
            </Pressable>
          )}
          <Pressable onPress={handleClear} style={styles.actionButton}>
            <Text style={[styles.actionLabel, styles.clearLabel]}>Clear</Text>
          </Pressable>
        </View>
      )}

      {(mode === 'rearTap' || mode === 'heatmap') && (
        <View
          style={[styles.captureBar, { bottom: insets.bottom + 128 }]}
          pointerEvents="box-none"
        >
          <CaptureButton onPress={handleCapture} disabled={capturing} />
        </View>
      )}

      {flash && <View style={styles.flash} pointerEvents="none" />}
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
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  captureBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  flash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    opacity: 0.85,
  },
  actionButton: {
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  closeLabel: {
    color: '#ffd60a',
  },
  clearLabel: {
    color: '#ff9f0a',
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
