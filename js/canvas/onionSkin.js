/**
 * Onion skin.
 *
 * Shows the previous frame faintly underneath the one being edited, so the
 * artist can see how far to move things between frames.
 *
 * The rule that matters: the previous frame is DRAWN, never MERGED. Nothing
 * in this file writes to a grid — it only reports which grid the renderer
 * should ghost and at what opacity. Frame 2 becomes part of frame 3 only if
 * the user explicitly presses "+ Duplicate".
 *
 * That is why onion skin lives here and not in tools.js: every function in
 * tools.js mutates a grid, and this one must not.
 */

/** Onion skin defaults. 30% is faint enough to read as "not the real frame". */
export const ONION_DEFAULT_OPACITY = 0.3;

/**
 * Work out what, if anything, to ghost under the active frame.
 *
 * Returns null when there is nothing to show — frame 1 has no predecessor,
 * and a disabled toggle or zero opacity means the user has asked for none.
 *
 * @returns {{ grid: string[][], opacity: number } | null}
 */
export function resolveOnion(frames, activeIndex, { enabled, opacity }) {
  if (!enabled) return null;
  if (opacity <= 0) return null;
  if (activeIndex <= 0) return null;          // no previous frame

  const previous = frames[activeIndex - 1];
  if (!previous) return null;

  return { grid: previous.grid, opacity };
}

/** True when a previous frame exists to ghost. Drives the UI hint. */
export function hasPreviousFrame(activeIndex) {
  return activeIndex > 0;
}