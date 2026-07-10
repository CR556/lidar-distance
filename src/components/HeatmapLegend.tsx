import {
  Canvas,
  Line,
  LinearGradient,
  matchFont,
  Rect,
  RoundedRect,
  Text as SkiaText,
  vec,
} from '@shopify/react-native-skia';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HEATMAP_COLORS, HEATMAP_LEGEND_TICKS } from '../lib/heatmap';
import { formatDistance, Unit } from '../lib/units';

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const tickFont = matchFont({ fontFamily, fontSize: 11, fontWeight: '600' });

const CANVAS_WIDTH = 86;
const BAR_WIDTH = 14;
const PAD_Y = 12; // headroom so tick labels at the ends aren't clipped

type Props = {
  unit: Unit;
  /** Currently displayed range (auto: live from native; fixed: user-set). */
  minMeters: number;
  maxMeters: number;
  mode: 'auto' | 'fixed';
  /** Tap anywhere on the scale (or the mode label) toggles auto/fixed. */
  onToggleMode: () => void;
  /** Tap the endpoint values (fixed mode only) to edit them. */
  onEditEndpoint: (endpoint: 'min' | 'max') => void;
};

/**
 * Vertical color scale for depth mode: far (blue) at top, near (red) at
 * bottom, with labeled tick marks that follow the current unit toggle.
 * In fixed mode the endpoint values get a translucent "textbox" treatment
 * and are tappable to edit; tapping the bar toggles auto/fixed.
 */
export function HeatmapLegend({
  unit,
  minMeters,
  maxMeters,
  mode,
  onToggleMode,
  onEditEndpoint,
}: Props) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const barHeight = Math.min(screenHeight * 0.5, 420);
  const canvasHeight = barHeight + PAD_Y * 2;
  const top = insets.top + (screenHeight - insets.top - insets.bottom - canvasHeight) / 2;
  const barX = CANVAS_WIDTH - BAR_WIDTH - 4;

  // Top of the bar = far end of the range.
  const topToBottomColors = [...HEATMAP_COLORS].reverse();

  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < HEATMAP_LEGEND_TICKS; i++) {
    const t = i / (HEATMAP_LEGEND_TICKS - 1); // 0 = top/far, 1 = bottom/near
    const y = PAD_Y + t * barHeight;
    const meters = maxMeters - t * (maxMeters - minMeters);
    const label = formatDistance(meters, unit);
    const labelWidth = tickFont.measureText(label).width;
    const labelX = barX - 8 - labelWidth;
    const labelY = y + 4;
    const isEndpoint = i === 0 || i === HEATMAP_LEGEND_TICKS - 1;

    if (isEndpoint && mode === 'fixed') {
      // Translucent "textbox" behind editable endpoint values.
      ticks.push(
        <RoundedRect
          key={`box-${i}`}
          x={labelX - 6}
          y={labelY - 13}
          width={labelWidth + 12}
          height={18}
          r={5}
          color="rgba(255,255,255,0.18)"
        />,
        <RoundedRect
          key={`boxb-${i}`}
          x={labelX - 6}
          y={labelY - 13}
          width={labelWidth + 12}
          height={18}
          r={5}
          color="rgba(255,255,255,0.55)"
          style="stroke"
          strokeWidth={1}
        />
      );
    }
    ticks.push(
      <Line
        key={`t-${i}`}
        p1={vec(barX - 4, y)}
        p2={vec(barX + BAR_WIDTH, y)}
        color="#fff"
        strokeWidth={1.5}
      />,
      <SkiaText
        key={`tl-halo-${i}`}
        x={labelX}
        y={labelY}
        text={label}
        font={tickFont}
        color="rgba(0,0,0,0.85)"
        style="stroke"
        strokeWidth={3}
      />,
      <SkiaText key={`tl-${i}`} x={labelX} y={labelY} text={label} font={tickFont} color="#fff" />
    );
  }

  const endpointHitHeight = 44;

  return (
    <View
      style={{ position: 'absolute', right: 6, top, width: CANVAS_WIDTH }}
      pointerEvents="box-none"
    >
      <Canvas style={{ width: CANVAS_WIDTH, height: canvasHeight }} pointerEvents="none">
        <Rect x={barX} y={PAD_Y} width={BAR_WIDTH} height={barHeight}>
          <LinearGradient
            start={vec(barX, PAD_Y)}
            end={vec(barX, PAD_Y + barHeight)}
            colors={topToBottomColors}
          />
        </Rect>
        <Rect
          x={barX}
          y={PAD_Y}
          width={BAR_WIDTH}
          height={barHeight}
          color="rgba(255,255,255,0.9)"
          style="stroke"
          strokeWidth={1}
        />
        {ticks}
      </Canvas>

      {/* Tap the scale to toggle auto/fixed. */}
      <Pressable
        onPress={onToggleMode}
        style={{
          position: 'absolute',
          right: 0,
          top: PAD_Y + endpointHitHeight / 2,
          width: BAR_WIDTH + 16,
          height: Math.max(barHeight - endpointHitHeight, 44),
        }}
      />

      {/* Endpoint hit areas: edit in fixed mode, toggle in auto. */}
      <Pressable
        onPress={mode === 'fixed' ? () => onEditEndpoint('max') : onToggleMode}
        style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_WIDTH, height: endpointHitHeight }}
      />
      <Pressable
        onPress={mode === 'fixed' ? () => onEditEndpoint('min') : onToggleMode}
        style={{
          position: 'absolute',
          left: 0,
          top: canvasHeight - endpointHitHeight,
          width: CANVAS_WIDTH,
          height: endpointHitHeight,
        }}
      />

      <Pressable onPress={onToggleMode} style={styles.modePill}>
        <Text style={styles.modeLabel}>{mode === 'auto' ? 'Auto' : 'Fixed'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  modePill: {
    alignSelf: 'flex-end',
    marginRight: 2,
    marginTop: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  modeLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
