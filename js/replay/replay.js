/**
 * Replay — reconstruct a grid by applying deltas in order.
 *
 * This is the assignment's core requirement: the grid at any point in time is
 * DERIVED from the delta log, never read from a stored snapshot. Nothing here
 * keeps a copy of any frame.
 *
 * ── Why derive instead of snapshot ──
 *
 * Snapshotting every step would mean storing a whole 64x64 grid (4,096 cells)
 * per action. A thousand-action session is four million cells. The delta log
 * for the same session is a few thousand small objects, and it can reproduce
 * every intermediate state exactly. That trade — cheap storage, computed
 * state — is what event sourcing buys, and it is what makes Phase 2's
 * server-side version history practical.
 *
 * ── Cost, and why it is fine here ──
 *
 * Naive seeking is O(n): to show step 500 you replay 500 deltas from empty.
 * Scrubbing a slider makes that O(n) per drag event. So gridAt() takes an
 * optional cursor: when you seek FORWARD from a known position it applies
 * only the deltas in between, which makes normal playback O(1) per frame.
 * Seeking backward still rebuilds, because a delta's `from` value is only
 * safe to reverse in exact opposite order.
 */

import { createGrid, cloneGrid } from '../canvas/grid.js';

/**
 * Build the grid as it stood after `count` entries.
 *
 * @param {object[]} entries  journal entries, in order
 * @param {number} count      how many to apply (0 = empty grid)
 * @param {number} size       grid dimension
 * @param {object} cursor     optional { grid, count } to advance from
 * @returns {{ grid, count }} the state, and how many entries it reflects
 */
export function gridAt(entries, count, size, cursor = null) {
  const target = Math.max(0, Math.min(count, entries.length));

  // Fast path: continue forward from where we already are.
  const canAdvance =
    cursor &&
    cursor.grid &&
    cursor.grid.length === size &&
    cursor.count <= target;

  const grid = canAdvance ? cursor.grid : createGrid(size);
  const start = canAdvance ? cursor.count : 0;

  for (let i = start; i < target; i++) {
    const e = entries[i];
    if (!e) continue;
    if (e.y < 0 || e.y >= size || e.x < 0 || e.x >= size) continue;  // stale size
    grid[e.y][e.x] = e.to;
  }

  return { grid, count: target };
}

/** Snapshot copy — use when the caller must not share the cursor's array. */
export function gridAtCopy(entries, count, size) {
  return cloneGrid(gridAt(entries, count, size).grid);
}

/**
 * Playback timing.
 *
 * Two modes, and the difference is worth stating:
 *
 *   'even'     one delta per tick, at a fixed rate. Predictable, and the
 *              usual choice — real drawing has long idle gaps that make a
 *              faithful replay mostly dead air.
 *   'realtime' honours the recorded timestamps, so pauses are preserved.
 *              Truthful, but only interesting for short sessions.
 */
export function scheduleFor(entries, index, { mode = 'even', speed = 1, stepMs = 18 }) {
  if (mode !== 'realtime') return stepMs / speed;

  const a = entries[index];
  const b = entries[index + 1];
  if (!a || !b) return stepMs / speed;

  // Long idle gaps are compressed — nobody wants to watch 40 seconds of
  // the artist thinking.
  const gap = Math.max(0, b.t - a.t);
  return Math.min(gap, 600) / speed;
}

/** Total entries, and how many belong to each frame. */
export function summarise(entries) {
  const byFrame = new Map();
  for (const e of entries) {
    byFrame.set(e.frameId, (byFrame.get(e.frameId) ?? 0) + 1);
  }
  return {
    total: entries.length,
    frames: byFrame.size,
    byFrame: [...byFrame.entries()].map(([frameId, count]) => ({ frameId, count })),
  };
}

/** Cells painted (non-null) after `count` entries — drives the readout. */
export function paintedAt(entries, count, size) {
  const { grid } = gridAt(entries, count, size);
  let n = 0;
  for (const row of grid) for (const cell of row) if (cell !== null) n++;
  return n;
}