import React, { useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';

import { dist3, formatArea, polygonArea, Vec3 } from '../lib/geometry';
import { shapeColor } from '../lib/colors';
import { projectionStore } from '../lib/projectionStore';
import { formatDistance, Unit } from '../lib/units';

export type ChainPoint = { id: string; world: Vec3 };
export type Chain = { points: ChainPoint[]; closed: boolean };

type Props = {
  /** Completed shapes plus the in-progress chain (closed: false) last. */
  chains: Chain[];
  unit: Unit;
  /** Highlight the first point of the active chain as a snap target. */
  snapHint: boolean;
};

/** White text with a dark halo so labels stay readable over any camera feed. */
function HaloText({
  x,
  y,
  size,
  bold,
  children,
}: {
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  children: string;
}) {
  const common = {
    x,
    y,
    fontSize: size,
    fontWeight: bold ? ('700' as const) : ('500' as const),
    textAnchor: 'middle' as const,
  };
  return (
    <>
      <SvgText {...common} stroke="rgba(0,0,0,0.85)" strokeWidth={3}>
        {children}
      </SvgText>
      <SvgText {...common} fill="#fff">
        {children}
      </SvgText>
    </>
  );
}

/**
 * Subscribes directly to the 30 Hz projection store so per-frame updates
 * re-render only this SVG layer — never the parent screen.
 */
export function ShapesOverlay({ chains, unit, snapHint }: Props) {
  const projections = useSyncExternalStore(projectionStore.subscribe, projectionStore.get);

  const lines: React.ReactNode[] = [];
  const fills: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];
  const markers: React.ReactNode[] = [];

  chains.forEach((chain, chainIndex) => {
    const projected = chain.points.map((p) => projections[p.id]);
    const isActive = chainIndex === chains.length - 1 && !chain.closed;
    const color = shapeColor(chainIndex);

    // Segment lines + length labels.
    const segmentCount = chain.closed ? chain.points.length : chain.points.length - 1;
    for (let i = 0; i < segmentCount; i++) {
      const j = (i + 1) % chain.points.length;
      const a = projected[i];
      const b = projected[j];
      if (!a?.visible || !b?.visible) continue;
      lines.push(
        <Line
          key={`l-${chainIndex}-${i}`}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={color.line}
          strokeWidth={2}
        />
      );
      const meters = dist3(chain.points[i].world, chain.points[j].world);
      labels.push(
        <HaloText
          key={`sl-${chainIndex}-${i}`}
          x={(a.x + b.x) / 2}
          y={(a.y + b.y) / 2 - 8}
          size={13}
        >
          {formatDistance(meters, unit)}
        </HaloText>
      );
    }

    // Fill + area label for closed shapes.
    if (chain.closed && chain.points.length >= 3) {
      const visible = projected.filter((p) => p?.visible);
      if (visible.length === chain.points.length) {
        fills.push(
          <Polygon
            key={`f-${chainIndex}`}
            points={projected.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={color.fill}
            stroke="none"
          />
        );
        const cx = projected.reduce((s, p) => s + p.x, 0) / projected.length;
        const cy = projected.reduce((s, p) => s + p.y, 0) / projected.length;
        const area = polygonArea(chain.points.map((p) => p.world));
        labels.push(
          <HaloText key={`al-${chainIndex}`} x={cx} y={cy + 5} size={16} bold>
            {formatArea(area, unit)}
          </HaloText>
        );
      }
    }

    // Point markers + per-point live camera distance.
    chain.points.forEach((point, i) => {
      const p = projected[i];
      if (!p?.visible) return;
      const isSnapTarget = isActive && i === 0 && snapHint;
      markers.push(
        <Circle
          key={`m-${chainIndex}-${i}`}
          cx={p.x}
          cy={p.y}
          r={isSnapTarget ? 9 : 5}
          fill={isSnapTarget ? color.fill : '#fff'}
          stroke={isSnapTarget ? color.line : 'rgba(0,0,0,0.7)'}
          strokeWidth={2}
        />
      );
      labels.push(
        <HaloText key={`pl-${chainIndex}-${i}`} x={p.x} y={p.y - 14} size={10}>
          {formatDistance(p.cameraMeters, unit)}
        </HaloText>
      );
    });
  });

  return (
    <Svg style={styles.overlay} pointerEvents="none">
      {fills}
      {lines}
      {markers}
      {labels}
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
