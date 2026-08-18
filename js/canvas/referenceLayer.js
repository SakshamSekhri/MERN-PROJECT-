/**
 * Reference layer.
 *
 * Mirrors onionSkin.js exactly, and for the same reason: nothing in this file
 * writes to a grid. It only reports which grid the renderer should ghost
 * beneath the active frame, and at what opacity.
 *
 * The reference is a target to copy by hand, never something that gets merged
 * into the artwork. If a cell of the reference could leak into the user's
 * grid, the similarity score in Milestone 7 would be scoring the app against
 * itself.
 *
 * Two ways to view a reference, both wired up:
 *   panel    — side by side with the canvas, the spec's default
 *   underlay — ghosted under the canvas like tracing paper
 * They are independent: you can use either, both, or neither.
 */

export const REFERENCE_DEFAULT_OPACITY = 0.35;

/**
 * Resolve the underlay, if any.
 *
 * Returns null when there is nothing to ghost: no reference loaded, underlay
 * switched off, opacity at zero, or — importantly — a size mismatch.
 *
 * @returns {{ grid: string[][], opacity: number } | null}
 */
export function resolveReferenceUnderlay(reference, { enabled, opacity, gridSize }) {
  if (!reference || !reference.grid) return null;
  if (!enabled) return null;
  if (opacity <= 0) return null;

  // A 32x32 reference cannot underlay a 64x64 canvas — the cells would not
  // line up, so every comparison downstream would be meaningless. Refuse
  // rather than draw something misleading.
  if (gridSize && reference.grid.length !== gridSize) return null;

  return { grid: reference.grid, opacity };
}

/** True when the loaded reference matches the working canvas size. */
export function referenceMatchesGrid(reference, gridSize) {
  return Boolean(reference?.grid) && reference.grid.length === gridSize;
}

/** Short human description of the reference state, for the UI hint. */
export function describeReference(reference, gridSize) {
  if (!reference?.grid) return 'No reference loaded';
  const size = reference.grid.length;
  if (size !== gridSize) {
    return `Reference is ${size}x${size}, canvas is ${gridSize}x${gridSize}`;
  }
  return `${size} x ${size} reference`;
}