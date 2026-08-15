/**
 * Drawing tools.
 *
 * Every tool writes through applyCell(), which is the only place the grid is
 * mutated during a stroke. That single choke point is what guarantees each
 * change also lands in the history as a delta — no tool can quietly bypass
 * undo.
 */

import { getCell, inBounds } from './grid.js';

/** Write one cell and record the delta. Returns true if anything changed. */
function applyCell(grid, history, x, y, color) {
  if (!inBounds(grid, x, y)) return false;
  const from = grid[y][x];
  if (from === color) return false;
  grid[y][x] = color;
  history.record(x, y, from, color);
  return true;
}

export function pencil(grid, history, x, y, color) {
  return applyCell(grid, history, x, y, color);
}

export function eraser(grid, history, x, y) {
  return applyCell(grid, history, x, y, null);
}

/**
 * Flood fill — iterative 4-way scan from the seed cell.
 *
 * Iterative on purpose: a recursive fill on a 64×64 grid can hit ~4,096
 * frames deep and blow the call stack. An explicit stack has no such limit.
 */
export function fill(grid, history, startX, startY, color) {
  if (!inBounds(grid, startX, startY)) return false;

  const target = grid[startY][startX];
  if (target === color) return false;   // already that colour, nothing to do

  const size = grid.length;
  const seen = new Uint8Array(size * size);
  const stack = [[startX, startY]];
  let changed = false;

  while (stack.length) {
    const [x, y] = stack.pop();
    if (!inBounds(grid, x, y)) continue;

    const idx = y * size + x;
    if (seen[idx]) continue;
    seen[idx] = 1;

    if (grid[y][x] !== target) continue;   // boundary — stop this branch

    if (applyCell(grid, history, x, y, color)) changed = true;

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return changed;
}

/** Read a colour off the canvas. Returns null for an empty cell. */
export function pick(grid, x, y) {
  return getCell(grid, x, y) ?? null;
}