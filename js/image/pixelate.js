/**
 * Image → pixel-art grid.
 *
 * The pipeline:
 *
 *     file → <img> → crop to square → draw into an NxN canvas
 *          → read raw RGBA → build grid → reduce palette
 *
 * The step that does the real work is drawing a 1920x1080 photo into a 32x32
 * canvas. With imageSmoothingEnabled the browser area-averages as it shrinks,
 * so each of the 1,024 output pixels is already a sensible average of the
 * region it came from. That is a proper downsample for free, in native code —
 * no hand-written box filter needed.
 *
 * Pure logic (cropping maths, grid building) is separated from the canvas
 * calls so it can be tested without a browser.
 */

import {
  rgbToHex, medianCut, applyPalette, quantizeChannels, uniqueColors,
} from './palette.js';

/** Below this alpha a source pixel becomes an empty cell, not a colour. */
const ALPHA_THRESHOLD = 128;

/* ─────────────── loading ─────────────── */

/**
 * Read a File into a decoded <img>.
 *
 * Uses an object URL rather than a data URL: no base64 round-trip, so a 10MB
 * photo does not become a 13MB string. The URL is revoked once decoded.
 */
/**
 * Read a File into a decoded <img>.
 *
 * Uses an object URL rather than a data URL: no base64 round-trip, so a 10MB
 * photo does not become a 13MB string.
 *
 * The URL is deliberately NOT revoked on load. Revoking it invalidates
 * img.src, so anything that later displays the image — an <img> tag pointing
 * at the same source — gets a broken link. The caller owns the lifetime and
 * calls releaseImage() when replacing it.
 */
/**
 * Read a File into a decoded <img>.
 *
 * Uses an object URL rather than a data URL: no base64 round-trip, so a 10MB
 * photo does not become a 13MB string.
 *
 * The URL is deliberately NOT revoked on load. Revoking it invalidates
 * img.src, so anything that later displays the image — an <img> tag pointing
 * at the same source — gets a broken link. The caller owns the lifetime and
 * calls releaseImage() when replacing it.
 */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('That file is not an image'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

/** Free the blob URL behind an image loaded by loadImageFromFile. */

/** Free the blob URL behind an image loaded by loadImageFromFile. */
export function releaseImage(img) {
  if (img && typeof img.src === 'string' && img.src.startsWith('blob:')) {
    URL.revokeObjectURL(img.src);
  }
}

/* ─────────────── cropping (pure) ─────────────── */

/**
 * Work out which part of the source image to sample.
 *
 * The grid is square; photos usually are not. Stretching a 16:9 photo into a
 * square grid squashes everything, so:
 *
 *   'cover'   — centre-crop to a square, filling the grid. Loses the edges.
 *   'contain' — fit the whole image, leaving empty cells above/below or
 *               left/right. Keeps everything, wastes grid space.
 *
 * 'cover' is the default because a reference the artist will trace should
 * use every cell it can.
 */
export function computeSourceRect(width, height, mode = 'cover') {
  if (mode === 'contain') {
    return { sx: 0, sy: 0, sw: width, sh: height };
  }
  const side = Math.min(width, height);
  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    sw: side,
    sh: side,
  };
}

/** Where to place a 'contain' image inside the square output canvas. */
export function computeDestRect(width, height, gridSize, mode = 'cover') {
  if (mode !== 'contain') {
    return { dx: 0, dy: 0, dw: gridSize, dh: gridSize };
  }
  const scale = Math.min(gridSize / width, gridSize / height);
  const dw = Math.round(width * scale);
  const dh = Math.round(height * scale);
  return {
    dx: Math.round((gridSize - dw) / 2),
    dy: Math.round((gridSize - dh) / 2),
    dw,
    dh,
  };
}

/* ─────────────── grid building (pure) ─────────────── */

/**
 * Turn a flat RGBA byte array into a 2D grid of hex strings.
 *
 * ImageData is a flat Uint8ClampedArray laid out [R,G,B,A, R,G,B,A, ...] in
 * row-major order, so the pixel at (x, y) starts at index (y * size + x) * 4.
 *
 * Mostly-transparent pixels become null rather than black — otherwise a PNG
 * with a transparent background would import as a solid black square.
 */
export function imageDataToGrid(data, size, alphaThreshold = ALPHA_THRESHOLD) {
  const grid = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const alpha = data[i + 3];
      row.push(
        alpha < alphaThreshold
          ? null
          : rgbToHex({ r: data[i], g: data[i + 1], b: data[i + 2] })
      );
    }
    grid.push(row);
  }
  return grid;
}

/* ─────────────── the pipeline ─────────────── */

/**
 * Convert an image into a pixel-art grid.
 *
 * @param {HTMLImageElement} img
 * @param {number} gridSize            16, 32 or 64
 * @param {object} options
 *   fit           'cover' | 'contain'
 *   paletteSize   number of colours to reduce to (0 disables reduction)
 *   method        'median-cut' | 'quantize'
 * @returns {{ grid: string[][], palette: string[], colorsBefore: number }}
 */
export function imageToGrid(img, gridSize, options = {}) {
  const {
    fit = 'cover',
    paletteSize = 16,
    method = 'median-cut',
  } = options;

  const canvas = document.createElement('canvas');
  canvas.width = gridSize;
  canvas.height = gridSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // Smoothing ON here, deliberately. This is the downsample — we *want* the
  // browser to average source regions together. Smoothing is only turned off
  // when displaying the result, to keep the cells hard-edged.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const src = computeSourceRect(img.naturalWidth, img.naturalHeight, fit);
  const dst = computeDestRect(src.sw, src.sh, gridSize, fit);

  ctx.clearRect(0, 0, gridSize, gridSize);
  ctx.drawImage(img, src.sx, src.sy, src.sw, src.sh, dst.dx, dst.dy, dst.dw, dst.dh);

  const { data } = ctx.getImageData(0, 0, gridSize, gridSize);
  let grid = imageDataToGrid(data, gridSize);

  const colorsBefore = uniqueColors(grid).length;
  let palette = [];

  if (paletteSize > 0) {
    if (method === 'quantize') {
      grid = grid.map(row => row.map(cell => {
        if (cell === null) return null;
        const rgb = { r: parseInt(cell.slice(1, 3), 16), g: parseInt(cell.slice(3, 5), 16), b: parseInt(cell.slice(5, 7), 16) };
        return rgbToHex(quantizeChannels(rgb, 6));
      }));
      palette = uniqueColors(grid);
    } else {
      palette = derivePalette(grid, paletteSize);
      grid = applyPalette(grid, palette);
    }
  } else {
    palette = uniqueColors(grid);
  }

  return { grid, palette, colorsBefore };
}

/** Run median cut over every non-empty cell and return hex swatches. */
export function derivePalette(grid, paletteSize) {
  const samples = [];
  for (const row of grid) {
    for (const cell of row) {
      if (cell === null) continue;
      samples.push({
        r: parseInt(cell.slice(1, 3), 16),
        g: parseInt(cell.slice(3, 5), 16),
        b: parseInt(cell.slice(5, 7), 16),
      });
    }
  }
  return medianCut(samples, paletteSize).map(rgbToHex);
}