/**
 * Canonical depth-heatmap definition — single source of truth shared by the
 * native renderer (via the `heatmapColors`/`heatmapRange` props) and the
 * on-screen legend, so the legend always matches the rendered colors exactly.
 */

/** Ramp stops, NEAR → FAR. Native interpolates a 256-entry LUT from these. */
export const HEATMAP_COLORS = [
  '#ff3b30', // red      (nearest)
  '#ff9f0a', // orange
  '#ffd60a', // yellow
  '#30d158', // green
  '#64d2ff', // cyan
  '#0a84ff', // blue     (farthest)
];

/** Distances mapped across the ramp; outside the range clamps to the ends. */
export const HEATMAP_MIN_METERS = 0.3;
export const HEATMAP_MAX_METERS = 5.0;

/** Heatmap layer opacity over the camera feed. */
export const HEATMAP_OPACITY = 0.65;

/** Number of labeled tick marks on the legend. */
export const HEATMAP_LEGEND_TICKS = 5;
