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



/**
 * Rescale a grid to a new cell count by nearest-neighbour sampling.
 *
 * This is a FALLBACK, not the preferred path. Re-pixelating from the original
 * photo always looks better, because it re-averages the full-resolution
 * source. Nearest-neighbour can only duplicate or drop cells that are already
 * there, so upscaling 16 to 64 gives chunky 4x4 blocks rather than detail.
 *
 * It exists for references with no source image behind them — a project
 * loaded from storage, for instance.
 */
export function resampleGrid(grid, newSize) {
  const oldSize = grid.length;
  if (oldSize === newSize) return cloneGrid(grid);

  const out = createGrid(newSize);
  for (let y = 0; y < newSize; y++) {
    for (let x = 0; x < newSize; x++) {
      const sy = Math.min(oldSize - 1, Math.floor((y * oldSize) / newSize));
      const sx = Math.min(oldSize - 1, Math.floor((x * oldSize) / newSize));
      out[y][x] = grid[sy][sx];
    }
  }
  return out;
}