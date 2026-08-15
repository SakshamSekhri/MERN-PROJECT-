/**
 * Grid → <canvas> renderer.
 *
 * The canvas is sized in *screen* pixels (640×640 by default) while the grid
 * is 16/32/64 cells. cellSize = canvasPixels / gridSize, so one logical
 * pixel-art cell occupies e.g. 20×20 screen pixels on a 32×32 grid.
 *
 * Full redraw every time. At 64×64 that is 4,096 fillRect calls, which is
 * nothing for a browser — no dirty-rect optimisation needed at this scale.
 */

const CHECKER_A = '#1b1730';
const CHECKER_B = '#221c3a';
const GRID_LINE = 'rgba(255,255,255,0.06)';
const GRID_LINE_MAJOR = 'rgba(255,255,255,0.14)';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
  }

  get size() { return this.canvas.width; }

  cellSize(gridSize) { return this.size / gridSize; }

  /**
   * Convert a pointer event into grid coordinates.
   * The canvas is displayed at a different CSS size than its internal
   * resolution, so we scale by the bounding rect rather than assuming 1:1.
   */
  toCell(evt, gridSize) {
    const rect = this.canvas.getBoundingClientRect();
    const cs = rect.width / gridSize;
    return {
      x: Math.floor((evt.clientX - rect.left) / cs),
      y: Math.floor((evt.clientY - rect.top) / cs),
    };
  }

  draw(grid, { showGridLines = true, onion = null } = {}) {
    const gridSize = grid.length;
    const cs = this.cellSize(gridSize);
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.size, this.size);
    this.#drawChecker(gridSize, cs);

    // Onion skin goes underneath, so the frame being edited always reads as
    // the solid one. globalAlpha is reset immediately after — leaving it set
    // would silently fade everything drawn later.
    if (onion) {
      ctx.globalAlpha = onion.opacity;
      this.#drawCells(onion.grid, cs);
      ctx.globalAlpha = 1;
    }

    this.#drawCells(grid, cs);

    if (showGridLines) this.#drawLines(gridSize, cs);
  }

  /** Paint every non-empty cell of a grid at full opacity. */
  #drawCells(grid, cs) {
    const ctx = this.ctx;
    const gridSize = grid.length;
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const color = grid[y][x];
        if (color === null) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x * cs, y * cs, cs, cs);
      }
    }
  }

  /** Transparency checkerboard, drawn in 2-cell blocks so it stays readable. */
  #drawChecker(gridSize, cs) {
    const ctx = this.ctx;
    const block = cs * 2;
    const count = Math.ceil(this.size / block);
    for (let by = 0; by < count; by++) {
      for (let bx = 0; bx < count; bx++) {
        ctx.fillStyle = (bx + by) % 2 === 0 ? CHECKER_A : CHECKER_B;
        ctx.fillRect(bx * block, by * block, block, block);
      }
    }
  }

  /** Thin lines every cell, brighter every 8 — helps counting on big grids. */
  #drawLines(gridSize, cs) {
    const ctx = this.ctx;
    ctx.lineWidth = 1;
    for (let i = 0; i <= gridSize; i++) {
      const p = Math.round(i * cs) + 0.5;
      ctx.strokeStyle = i % 8 === 0 ? GRID_LINE_MAJOR : GRID_LINE;
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, this.size);
      ctx.moveTo(0, p); ctx.lineTo(this.size, p);
      ctx.stroke();
    }
  }
}

/**
 * Paint a grid into a small canvas — timeline thumbnails and, later, the
 * Animation Studio preview. No grid lines: at 48px they would be noise.
 *
 * Note this is a standalone export, OUTSIDE the class. It takes a canvas
 * rather than being a method, so callers can render many thumbnails without
 * constructing a Renderer for each one.
 */
export function drawThumbnail(canvas, grid) {
  const ctx = canvas.getContext('2d');
  const gridSize = grid.length;
  const cs = canvas.width / gridSize;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = CHECKER_A;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const color = grid[y][x];
      if (color === null) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * cs, y * cs, Math.ceil(cs), Math.ceil(cs));
    }
  }
}