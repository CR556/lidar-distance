import {
  Canvas,
  Line,
  LinearGradient,
  matchFont,
  Rect,
  Text as SkiaText,
  vec,
} from '@shopify/react-native-skia';
import React from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  HEATMAP_COLORS,
  HEATMAP_LEGEND_TICKS,
  HEATMAP_MAX_METERS,
  HEATMAP_MIN_METERS,
} from '../lib/heatmap';
import { formatDistance, Unit } from '../lib/units';

const fontFamily = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });
const tickFont = matchFont({ fontFamily, fontSize: 11, fontWeight: '600' });

const CANVAS_WIDTH = 86;
const BAR_WIDTH = 14;
const PAD_Y = 12; // headroom so tick labels at the ends aren't clipped

/**
 * Vertical color scale for depth mode: far (blue) at top, near (red) at
 * bottom, with labeled tick marks that follow the current unit toggle.
 * Colors/range come from lib/heatmap.ts — the same values the native
 * renderer uses, so the legend is exact by construction.
 */
export function HeatmapLegend({ unit }: { unit: Unit }) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const barHeight = Math.min(screenHeight * 0.5, 420);
  const canvasHeight = barHeight + PAD_Y * 2;
  const top = insets.top + (screenHeight - insets.top - insets.bottom - canvasHeight) / 2;
  const barX = CANVAS_WIDTH - BAR_WIDTH - 4;

  // Top of the bar = far end of the range.
  const topToBottomColors = [...HEATMAP_COLORS].reverse();

  const ticks = [];
  for (let i = 0; i < HEATMAP_LEGEND_TICKS; i++) {
    const t = i / (HEATMAP_LEGEND_TICKS - 1); // 0 = top/far, 1 = bottom/near
    const y = PAD_Y + t * barHeight;
    const meters = HEATMAP_MAX_METERS - t * (HEATMAP_MAX_METERS - HEATMAP_MIN_METERS);
    const label = formatDistance(meters, unit);
    const labelWidth = tickFont.measureText(label).width;
    const labelX = barX - 8 - labelWidth;
    const labelY = y + 4;
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

  return (
    <Canvas
      style={{ position: 'absolute', right: 6, top, width: CANVAS_WIDTH, height: canvasHeight }}
      pointerEvents="none"
    >
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
  );
}
