/**
 * Export Pro Suite — PixelVerse.
 *
 * Provides single frame image export (PNG, JPEG, BMP) and multi-frame Sprite Sheet generation.
 */

import { drawThumbnail } from '../canvas/renderer.js';

/**
 * Render a frame grid to an offscreen canvas at a specified pixel scale.
 * @param {Array<Array<string|null>>} grid - 2D color grid
 * @param {number} scale - Pixel multiplier (e.g. 1, 4, 8, 16)
 * @param {Object} options - { background: 'transparent' | '#ffffff' | string }
 */
export function gridToCanvas(grid, scale = 1, options = {}) {
  if (!grid) return null;
  const gridSize = grid.length;
  const canvas = document.createElement('canvas');
  canvas.width = gridSize * scale;
  canvas.height = gridSize * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const bg = options.background;
  if (bg && bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const color = grid[y][x];
      if (color === null) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }

  return canvas;
}

/**
 * Convert canvas ImageData to 24-bit uncompressed Windows BMP Blob.
 */
export function canvasToBmpBlob(canvas) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;

  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileLength = 54 + pixelArraySize;

  const buffer = new ArrayBuffer(fileLength);
  const view = new DataView(buffer);

  // File Header
  view.setUint16(0, 0x424D, false); // "BM"
  view.setUint32(2, fileLength, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, 54, true);

  // DIB Header (BITMAPINFOHEADER)
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // top-down
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true); // 24-bit RGB
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  let offset = 54;
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const idx = rowStart + x * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      const a = pixels[idx + 3];

      if (a < 128) {
        // Default transparent pixels to white background in 24-bit BMP
        view.setUint8(offset++, 255);
        view.setUint8(offset++, 255);
        view.setUint8(offset++, 255);
      } else {
        view.setUint8(offset++, b);
        view.setUint8(offset++, g);
        view.setUint8(offset++, r);
      }
    }
    const padding = rowSize - width * 3;
    for (let p = 0; p < padding; p++) {
      view.setUint8(offset++, 0);
    }
  }

  return new Blob([buffer], { type: 'image/bmp' });
}

/**
 * Download a single frame image in PNG, JPEG, or BMP format.
 */
export function downloadSingleFrame(grid, format = 'png', filename = 'pixelverse-artwork', scale = 8) {
  if (!grid) return;
  const bg = format === 'jpeg' ? '#ffffff' : 'transparent';
  const canvas = gridToCanvas(grid, scale, { background: bg });
  if (!canvas) return;

  const link = document.createElement('a');

  if (format === 'bmp') {
    const blob = canvasToBmpBlob(canvas);
    const url = URL.createObjectURL(blob);
    link.download = `${filename}.bmp`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else if (format === 'jpeg') {
    link.download = `${filename}.jpg`;
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  } else {
    // PNG
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
}

/**
 * Download selected frames as a combined PNG Sprite Sheet.
 */
export function downloadSpriteSheet(frames, size, selectedIndices = null, scale = 4) {
  if (!frames || frames.length === 0) return;
  const indices = selectedIndices && selectedIndices.length > 0
    ? selectedIndices
    : frames.map((_, i) => i);

  const selectedFrames = indices.map(i => frames[i]).filter(Boolean);
  if (selectedFrames.length === 0) return;

  const count = selectedFrames.length;
  const frameWidth = size * scale;
  const frameHeight = size * scale;

  const canvas = document.createElement('canvas');
  canvas.width = frameWidth * count;
  canvas.height = frameHeight;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  selectedFrames.forEach((f, i) => {
    const frameCanvas = gridToCanvas(f.grid, scale, { background: 'transparent' });
    if (frameCanvas) {
      ctx.drawImage(frameCanvas, i * frameWidth, 0);
    }
  });

  const link = document.createElement('a');
  link.download = `pixelverse-spritesheet-${count}x${size*scale}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
