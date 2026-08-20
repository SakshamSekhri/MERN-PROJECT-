/**
 * Onion skin.
 *
 * Shows previous frames faintly underneath the one being edited, so the
 * artist can judge how far to move things between frames.
 *
 * The rule that matters: previous frames are DRAWN, never MERGED. Nothing in
 * this file writes to a grid — it only reports which grids the renderer
 * should ghost and at what opacity. Frame 2 becomes part of frame 3 only if
 * the user explicitly presses "+ Duplicate".
 *
 * That is why onion skin lives here and not in tools.js: every function in
 * tools.js mutates a grid, and this one must not.
 */

/** 30% is faint enough that the ghost never reads as the real frame. */
export const ONION_DEFAULT_OPACITY = 0.3;

/** How many frames back can be ghosted at once. */
export const ONION_MAX_DEPTH = 3;

/**
 * Each step further back fades by this factor.
 *
 * A fixed opacity for every layer would be unreadable — three frames at 30%
 * stack into an indistinguishable smear, and you could not tell which ghost
 * was most recent. Geometric falloff keeps the ordering legible: at 30% base
 * the layers land at roughly 30%, 17%, 9%.
 */
const FALLOFF = 0.55;

/**
 * Work out what, if anything, to ghost under the active frame.
 *
 * Returns an array of layers ordered FARTHEST FIRST, so the renderer can
 * paint them in sequence and have the most recent frame end up on top.
 * An empty array means nothing to draw.
 *
 * @returns {{ grid: string[][], opacity: number, distance: number }[]}
 */
export function resolveOnion(frames, activeIndex, { enabled, opacity, depth = 1 }) {
  if (!enabled) return [];
  if (opacity <= 0) return [];
  if (activeIndex <= 0) return [];          // no previous frame

  const wanted = Math.max(1, Math.min(depth, ONION_MAX_DEPTH));
  const layers = [];

  // Walk backwards from the active frame, but never past the start.
  for (let distance = 1; distance <= wanted; distance++) {
    const index = activeIndex - distance;
    if (index < 0) break;
    const frame = frames[index];
    if (!frame) break;

    layers.push({
      grid: frame.grid,
      opacity: opacity * Math.pow(FALLOFF, distance - 1),
      distance,
    });
  }

  // Farthest first: later draws land on top, so the nearest frame is boldest.
  return layers.reverse();
}

/** True when a previous frame exists to ghost. */
export function hasPreviousFrame(activeIndex) {
  return activeIndex > 0;
}

/** How many frames are actually available to ghost, given the depth setting. */
export function availableDepth(activeIndex, depth) {
  return Math.max(0, Math.min(activeIndex, depth, ONION_MAX_DEPTH));
}

/** Human description of what is currently ghosted, for the UI hint. */
export function describeOnion(activeIndex, depth, enabled) {
  if (activeIndex <= 0) return 'Frame 1 has nothing before it';
  if (!enabled) return 'Off';

  const count = availableDepth(activeIndex, depth);
  if (count === 1) return `Ghosting frame ${activeIndex}`;

  const oldest = activeIndex - count + 1;
  return `Ghosting frames ${oldest}-${activeIndex}`;
}