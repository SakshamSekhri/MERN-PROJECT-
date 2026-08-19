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

// Error marker colours — deliberately outside the default palette so a mark
// can never be confused with something the user painted.
const ERROR_MISSING = '#22d3ee';   // cyan   — paint belongs here
const ERROR_EXTRA   = '#f43f5e';   // red    — paint should not be here
const ERROR_WRONG   = '#fbbf24';   // gold   — right place, wrong colour

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
  }

  get size() { return this.canvas ? this.canvas.width : 0; }

  cellSize(gridSize) { return this.size / gridSize; }

  /**
   * Convert a pointer event into grid coordinates.
   * The canvas is displayed at a different CSS size than its internal
   * resolution, so we scale by the bounding rect rather than assuming 1:1.
   */
  toCell(evt, gridSize) {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const cs = rect.width / gridSize;
    return {
      x: Math.floor((evt.clientX - rect.left) / cs),
      y: Math.floor((evt.clientY - rect.top) / cs),
    };
  }

  /**
   * Paint a frame.
   *
   * Layer order, bottom to top:
   *   checkerboard -> reference -> onion layers -> active grid
   *   -> grid lines -> error markers
   *
   * `onion` is an array of { grid, opacity } ordered farthest-first.
   */
  draw(grid, { showGridLines = true, onion = null, reference = null, errors = null } = {}) {
    if (!this.canvas || !this.ctx || !grid) return;
    const gridSize = grid.length;
    const cs = this.cellSize(gridSize);
    const ctx = this.ctx;

    ctx.clearRect(0, 0, this.size, this.size);
    this.#drawChecker(gridSize, cs);

    // Underlays are drawn at reduced alpha, which is reset immediately after
    // each — leaving globalAlpha set would silently fade everything drawn
    // later, including the artwork itself.
    if (reference) {
      ctx.globalAlpha = reference.opacity;
      this.#drawCells(reference.grid, cs);
      ctx.globalAlpha = 1;
    }

    // Onion skin is a list, farthest frame first, so nearer frames land on
    // top. A single object is accepted too, for callers that only ghost one.
    const onionLayers = Array.isArray(onion) ? onion : (onion ? [onion] : []);
    for (const layer of onionLayers) {
      if (!layer || layer.opacity <= 0) continue;
      ctx.globalAlpha = layer.opacity;
      this.#drawCells(layer.grid, cs);
      ctx.globalAlpha = 1;
    }

    this.#drawCells(grid, cs);

    if (showGridLines) this.#drawLines(gridSize, cs);

    // Error markers sit above the grid lines — they are the most important
    // thing on screen when comparison is on, so nothing overlaps them.
    if (errors && errors.length) this.#drawErrors(errors, cs);
  }

  /** Paint every non-empty cell of a grid at the current alpha. */
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

  /**
   * Mark cells that differ from the reference.
   *
   * Each failure type gets its own colour and its own mark, so the artist can
   * tell them apart at a glance without a legend:
   *
   *   missing — a hollow square: paint belongs here and there is none
   *   extra   — a diagonal slash: paint here that should not be
   *   wrong   — a thick outline: right place, wrong colour
   *
   * Marks are strokes, never fills, so the user's own artwork stays visible
   * underneath. Highlighting that hid the work would defeat the purpose.
   */
  #drawErrors(errors, cs) {
    const ctx = this.ctx;
    const inset = Math.max(1, cs * 0.14);

    for (const { x, y, type } of errors) {
      const px = x * cs;
      const py = y * cs;

      if (type === 'missing') {
        ctx.strokeStyle = ERROR_MISSING;
        ctx.lineWidth = Math.max(1, cs * 0.12);
        ctx.strokeRect(px + inset, py + inset, cs - inset * 2, cs - inset * 2);
      } else if (type === 'extra') {
        ctx.strokeStyle = ERROR_EXTRA;
        ctx.lineWidth = Math.max(1, cs * 0.16);
        ctx.beginPath();
        ctx.moveTo(px + inset, py + inset);
        ctx.lineTo(px + cs - inset, py + cs - inset);
        ctx.stroke();
      } else {
        ctx.strokeStyle = ERROR_WRONG;
        ctx.lineWidth = Math.max(1, cs * 0.18);
        ctx.strokeRect(px + inset / 2, py + inset / 2, cs - inset, cs - inset);
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
 * Paint a grid into a small canvas — timeline thumbnails and the Animation
 * Studio preview. No grid lines: at 48px they would be noise.
 *
 * Standalone export, OUTSIDE the class. It takes a canvas rather than being
 * a method, so callers can render many thumbnails without constructing a
 * Renderer for each one.
 */
export function drawThumbnail(canvas, grid) {
  if (!canvas || !grid) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
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