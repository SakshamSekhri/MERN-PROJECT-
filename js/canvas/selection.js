/**
 * Selection & Canvas Transform Engine for PixelVerse.
 *
 * Provides rectangular & lasso selection masking, pixel buffer extraction,
 * drag-moving floating selections, pasting across frames, and spatial transforms:
 *   - Flip Horizontal (Flip X)
 *   - Flip Vertical (Flip Y)
 *   - Rotate 90° Clockwise
 */

/** Bounding box of a boolean mask grid */
export function getMaskBounds(mask) {
  if (!mask || mask.length === 0) return null;
  const h = mask.length;
  const w = mask[0].length;

  let minX = w, maxX = -1, minY = h, maxY = -1;
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y][x]) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (count === 0) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    count,
  };
}

/** Create an empty boolean mask grid */
export function createEmptyMask(size) {
  return Array.from({ length: size }, () => Array(size).fill(false));
}

/** Generate a rectangular selection mask */
export function createRectMask(size, x1, y1, x2, y2) {
  const mask = createEmptyMask(size);
  const minX = Math.max(0, Math.min(x1, x2));
  const maxX = Math.min(size - 1, Math.max(x1, x2));
  const minY = Math.max(0, Math.min(y1, y2));
  const maxY = Math.min(size - 1, Math.max(y1, y2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      mask[y][x] = true;
    }
  }
  return mask;
}

/** Generate a lasso / freehand polygon selection mask */
export function createLassoMask(size, points) {
  const mask = createEmptyMask(size);
  if (!points || points.length < 3) return mask;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) {
        mask[y][x] = true;
      }
    }
  }
  return mask;
}

/** Ray-casting point-in-polygon check */
function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Extract pixel grid region into a 2D buffer array */
export function extractBuffer(grid, mask, bounds) {
  if (!bounds) return null;
  const { minX, minY, width, height } = bounds;
  const buffer = Array.from({ length: height }, () => Array(width).fill(null));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = minX + x;
      const gy = minY + y;
      if (gy < grid.length && gx < grid[0].length && mask[gy][gx]) {
        buffer[y][x] = grid[gy][gx];
      }
    }
  }
  return buffer;
}

/** Clear masked pixels from canvas grid */
export function clearMaskedPixels(grid, history, mask) {
  const size = grid.length;
  let changed = false;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (mask[y][x] && grid[y][x] !== null) {
        if (history) history.record(x, y, grid[y][x], null);
        grid[y][x] = null;
        changed = true;
      }
    }
  }
  return changed;
}

/** Stamp a floating buffer array into target pixel grid */
export function stampBuffer(grid, history, buffer, originX, originY) {
  if (!buffer || buffer.length === 0) return false;
  const bh = buffer.length;
  const bw = buffer[0].length;
  const size = grid.length;
  let changed = false;

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const color = buffer[y][x];
      if (color !== null) {
        const gx = originX + x;
        const gy = originY + y;
        if (gx >= 0 && gx < size && gy >= 0 && gy < size) {
          const oldColor = grid[gy][gx];
          if (oldColor !== color) {
            if (history) history.record(gx, gy, oldColor, color);
            grid[gy][gx] = color;
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}

/** Flip pixel buffer horizontally */
export function flipBufferX(buffer) {
  if (!buffer) return null;
  return buffer.map(row => [...row].reverse());
}

/** Flip pixel buffer vertically */
export function flipBufferY(buffer) {
  if (!buffer) return null;
  return [...buffer].reverse().map(row => [...row]);
}

/** Rotate pixel buffer 90° clockwise */
export function rotateBuffer90(buffer) {
  if (!buffer || buffer.length === 0) return null;
  const h = buffer.length;
  const w = buffer[0].length;
  const rotated = Array.from({ length: w }, () => Array(h).fill(null));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      rotated[x][h - 1 - y] = buffer[y][x];
    }
  }
  return rotated;
}

/**
 * State manager for active canvas selection and clipboard operations.
 */
export class SelectionManager {
  constructor() {
    this.mask = null;         // 2D boolean array or null
    this.bounds = null;       // Bounding box object
    this.buffer = null;       // 2D pixel array [h][w]
    this.originX = 0;         // Left coordinate on grid
    this.originY = 0;         // Top coordinate on grid
    this.isFloating = false;  // True if cut from grid and floating
    this.clipboard = null;    // Copied buffer for paste
  }

  hasSelection() {
    return Boolean(this.bounds && this.bounds.count > 0);
  }

  setMask(mask, size) {
    this.mask = mask;
    this.bounds = getMaskBounds(mask);
    if (this.bounds) {
      this.originX = this.bounds.minX;
      this.originY = this.bounds.minY;
    }
    this.isFloating = false;
    this.buffer = null;
  }

  clear() {
    this.mask = null;
    this.bounds = null;
    this.buffer = null;
    this.isFloating = false;
    this.originX = 0;
    this.originY = 0;
  }

  lift(grid, history) {
    if (!this.hasSelection() || this.isFloating) return;
    this.buffer = extractBuffer(grid, this.mask, this.bounds);
    clearMaskedPixels(grid, history, this.mask);
    this.isFloating = true;
  }

  stamp(grid, history) {
    if (!this.isFloating || !this.buffer) return false;
    const changed = stampBuffer(grid, history, this.buffer, this.originX, this.originY);
    this.clear();
    return changed;
  }

  copy(grid) {
    if (this.isFloating && this.buffer) {
      this.clipboard = JSON.parse(JSON.stringify(this.buffer));
    } else if (this.hasSelection()) {
      const buf = extractBuffer(grid, this.mask, this.bounds);
      this.clipboard = JSON.parse(JSON.stringify(buf));
    }
    return Boolean(this.clipboard);
  }

  paste(grid, history, targetX = 0, targetY = 0) {
    if (!this.clipboard) return false;
    // Commit existing floating selection if any
    if (this.isFloating) {
      this.stamp(grid, history);
    }
    this.buffer = JSON.parse(JSON.stringify(this.clipboard));
    this.originX = targetX;
    this.originY = targetY;
    const h = this.buffer.length;
    const w = this.buffer[0].length;
    this.bounds = { minX: targetX, minY: targetY, maxX: targetX + w - 1, maxY: targetY + h - 1, width: w, height: h, count: w * h };
    this.isFloating = true;
    return true;
  }

  flipX() {
    if (this.buffer) {
      this.buffer = flipBufferX(this.buffer);
    }
  }

  flipY() {
    if (this.buffer) {
      this.buffer = flipBufferY(this.buffer);
    }
  }

  rotate90() {
    if (this.buffer) {
      this.buffer = rotateBuffer90(this.buffer);
      if (this.bounds) {
        const newW = this.buffer[0].length;
        const newH = this.buffer.length;
        this.bounds.width = newW;
        this.bounds.height = newH;
        this.bounds.maxX = this.originX + newW - 1;
        this.bounds.maxY = this.originY + newH - 1;
      }
    }
  }
}
