/**
 * Animation statistics.
 *
 * Pure functions over the frame array — no DOM, no state import. The studio
 * calls these to fill its info panel; Milestone 7 reuses the same shape when
 * reporting per-frame accuracy.
 */

import { countFilled } from '../canvas/grid.js';

/**
 * Summarise an animation.
 *
 * Duration is frames / fps. Note this counts frames, not gaps: a 24-frame
 * animation at 24 FPS runs for exactly one second because each frame is
 * held for 1/24s, including the last one before it loops.
 */
export function computeStats(frames, fps) {
  const count = frames.length;
  const gridSize = count > 0 ? frames[0].grid.length : 0;
  const durationMs = fps > 0 ? (count / fps) * 1000 : 0;

  let painted = 0;
  let blank = 0;
  for (const frame of frames) {
    const filled = countFilled(frame.grid);
    painted += filled;
    if (filled === 0) blank++;
  }

  return {
    count,
    gridSize,
    fps,
    durationMs,
    painted,
    blank,
    cellsPerFrame: gridSize * gridSize,
  };
}

/** Human-readable duration: "0.75s", "1.5s", "12s". */
export function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(2).replace(/\.?0+$/, '')}s`;
  return `${Math.round(seconds)}s`;
}