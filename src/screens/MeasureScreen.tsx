import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  LidarMeasureView,
  LidarMeasureViewRef,
  MeasureErrorEvent,
  MeasureMode,
  ProjectedPoint,
  ProjectedPointsEvent,
  TrackingStateEvent,
} from '../../modules/lidar-measure';
import { CrosshairOverlay } from '../components/CrosshairOverlay';
import { DebugOverlay } from '../components/DebugOverlay';
import { DistanceReadout } from '../components/DistanceReadout';
import { ModeSwitcher } from '../components/ModeSwitcher';
import { Chain, ChainPoint, ShapesOverlay } from '../components/ShapesOverlay';
import { UnitToggle } from '../components/UnitToggle';
import { useDistanceFeed } from '../hooks/useDistanceFeed';
import { useUnits } from '../hooks/useUnits';
import { formatArea, perimeter, polygonArea } from '../lib/geometry';
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
    : ['rearTap', 'rearCrosshair', 'front'];
  const [mode, setMode] = useState<MeasureMode>(frontOnly ? 'front' : 'rearCrosshair');
  const { unit, cycleUnit } = useUnits();
  const { event, stale, onDistance, reset } = useDistanceFeed();
  const [tracking, setTracking] = useState<TrackingStateEvent>({ state: 'initializing' });
  const [lastError, setLastError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [debugVisible, setDebugVisible] = useState(false);

  // Shape measuring state (rearTap mode).
  const [shapes, setShapes] = useState<Chain[]>([]);
  const [current, setCurrent] = useState<ChainPoint[]>([]);
  const [projections, setProjections] = useState<Record<string, ProjectedPoint>>({});
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
    const next: Record<string, ProjectedPoint> = {};
    for (const p of e.nativeEvent.points) {
      next[p.id] = p;
    }
    setProjections(next);
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
        const first = projections[current[0].id];
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
    [mode, current, projections, closeShape, showToast]
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
    setProjections({});
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

  const showCrosshair =
    mode === 'rearCrosshair' || mode === 'front' || (mode === 'rearTap' && readoutMode === 'camera');
  const hasAnything = current.length > 0 || shapes.length > 0;

  return (
    <View style={styles.container}>
      <LidarMeasureView
        ref={viewRef}
        style={StyleSheet.absoluteFill}
        mode={mode}
        updateHz={30}
        smoothing={{ medianWindow: 5, emaAlpha: 0.3 }}
        showNativeMarkers={false}
        onDistance={onDistance}
        onTrackingState={handleTrackingState}
        onError={handleError}
        onProjectedPoints={handleProjectedPoints}
      />

      {mode === 'rearTap' && (
        <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />
      )}

      {mode !== 'front' && (
        <ShapesOverlay
          chains={chainsForOverlay}
          projections={projections}
          unit={unit}
          snapHint={current.length >= 3}
        />
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
