import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { HEATMAP_MAX_METERS, HEATMAP_MIN_METERS } from '../lib/heatmap';

const STORAGE_KEY = 'lidar-distance.heatmap-settings';

export type HeatmapRangeMode = 'auto' | 'fixed';

/**
 * Heatmap range settings: auto (far end tracks the furthest visible object,
 * reported by native) vs fixed (user-set min/max). Persisted across launches.
 */
export function useHeatmapSettings() {
  const [rangeMode, setRangeMode] = useState<HeatmapRangeMode>('auto');
  const [fixedRange, setFixedRange] = useState({
    min: HEATMAP_MIN_METERS,
    max: HEATMAP_MAX_METERS,
  });
  // Latest auto far-end from native; only meaningful in auto mode.
  const [autoMax, setAutoMax] = useState(HEATMAP_MAX_METERS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (parsed.rangeMode === 'auto' || parsed.rangeMode === 'fixed') {
          setRangeMode(parsed.rangeMode);
        }
        if (
          typeof parsed.min === 'number' &&
          typeof parsed.max === 'number' &&
          parsed.min > 0 &&
          parsed.max > parsed.min
        ) {
          setFixedRange({ min: parsed.min, max: parsed.max });
        }
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((mode: HeatmapRangeMode, range: { min: number; max: number }) => {
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rangeMode: mode, min: range.min, max: range.max })
    ).catch(() => {});
  }, []);

  const toggleRangeMode = useCallback(() => {
    setRangeMode((mode) => {
      const next = mode === 'auto' ? 'fixed' : 'auto';
      setFixedRange((range) => {
        persist(next, range);
        return range;
      });
      return next;
    });
  }, [persist]);

  const setEndpoint = useCallback(
    (endpoint: 'min' | 'max', meters: number) => {
      setFixedRange((range) => {
        const next =
          endpoint === 'min'
            ? { min: Math.min(meters, range.max - 0.1), max: range.max }
            : { min: range.min, max: Math.max(meters, range.min + 0.1) };
        persist('fixed', next);
        return next;
      });
    },
    [persist]
  );

  return { rangeMode, fixedRange, autoMax, setAutoMax, toggleRangeMode, setEndpoint };
}
