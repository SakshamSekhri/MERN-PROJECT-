/**
 * The grid.
 *
 * A frame is a 2D array of colour strings, or null for an empty cell.
 * grid[y][x] — row-major, so grid[y] is one horizontal row.
 *
 * Everything downstream (rendering, undo, similarity scoring, and in Phase 2
 * the pixel deltas) reads this one shape. Keep it plain and serialisable —
 * it has to survive JSON.stringify for LocalStorage.
 */

export function createGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

export function cloneGrid(grid) {
  return grid.map(row => [...row]);
}

export function inBounds(grid, x, y) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid.length;
}

export function getCell(grid, x, y) {
  return inBounds(grid, x, y) ? grid[y][x] : undefined;
}

/** Count non-empty cells — drives the "painted" readout. */
export function countFilled(grid) {
  let n = 0;
  for (const row of grid) for (const cell of row) if (cell !== null) n++;
  return n;
}

/**
 * Resize by copying the overlapping top-left region.
 * Growing pads with empty cells; shrinking crops. Never silently wipes work.
 */
export function resizeGrid(grid, newSize) {
  const next = createGrid(newSize);
  const overlap = Math.min(grid.length, newSize);
  for (let y = 0; y < overlap; y++) {
    for (let x = 0; x < overlap; x++) next[y][x] = grid[y][x];
  }
  return next;
}