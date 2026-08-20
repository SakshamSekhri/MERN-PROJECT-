/**
 * Frame management.
 *
 * A frame is one independent pixel grid plus its own undo history:
 *
 *     { id, grid, history }
 *
 * Two rules hold this together, and both come straight from the spec:
 *
 * 1. Frames never share a grid reference. Duplicating deep-copies via
 *    cloneGrid — if two frames pointed at the same array, painting on one
 *    would silently corrupt the other. That is the "no accidental collision
 *    between frames" requirement, enforced in code rather than by convention.
 *
 * 2. Every frame carries its own History. Undo on frame 3 must not reach
 *    back and undo a stroke on frame 1 — the user thinks of them as separate
 *    drawings, so the undo stacks are separate too.
 *
 * All frames share one grid size. An animation cannot have a 16x16 frame
 * next to a 64x64 one, so resizing resizes every frame together.
 */

import { createGrid, cloneGrid, resizeGrid } from '../canvas/grid.js';
import { History } from '../canvas/history.js';

let nextId = 1;

/** Build a frame. Pass a grid to copy it, or omit for an empty one. */
export function makeFrame(size, sourceGrid = null) {
  return {
    id: nextId++,
    grid: sourceGrid ? cloneGrid(sourceGrid) : createGrid(size),
    history: new History(),
  };
}

/**
 * Insert a new frame after `index`.
 * mode 'empty'     — blank grid
 * mode 'duplicate' — exact copy of the frame at `index`
 * Returns the index of the new frame.
 */
export function addFrame(frames, index, size, mode = 'empty') {
  const source = mode === 'duplicate' && frames[index] ? frames[index].grid : null;
  const frame = makeFrame(size, source);
  frames.splice(index + 1, 0, frame);
  return index + 1;
}

/**
 * Remove a frame. Refuses to delete the last one — an animation with zero
 * frames has nothing to edit, so the editor would have no valid state.
 * Returns the index that should now be active, or null if nothing happened.
 */
export function deleteFrame(frames, index) {
  if (frames.length <= 1) return null;
  if (index < 0 || index >= frames.length) return null;
  frames.splice(index, 1);
  return Math.min(index, frames.length - 1);
}

/** Move a frame from one position to another. Returns its new index. */
export function moveFrame(frames, from, to) {
  if (from === to) return from;
  if (from < 0 || from >= frames.length) return from;
  const clamped = Math.max(0, Math.min(to, frames.length - 1));
  const [frame] = frames.splice(from, 1);
  frames.splice(clamped, 0, frame);
  return clamped;
}

/** Resize every frame together so the animation stays uniform. */
export function resizeAllFrames(frames, newSize) {
  for (const frame of frames) {
    frame.grid = resizeGrid(frame.grid, newSize);
    frame.history.clear();   // old deltas reference cells that may be gone
  }
}