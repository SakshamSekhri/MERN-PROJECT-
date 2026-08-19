/**
 * Export Pro Animation Suite — PixelVerse.
 *
 * Provides game-engine ready PNG Sprite Sheet download and multi-frame exporting.
 */

import { drawThumbnail } from '../canvas/renderer.js';

export function downloadSpriteSheet(frames, size) {
  if (!frames || frames.length === 0) return;
  const count = frames.length;
  const canvas = document.createElement('canvas');
  canvas.width = size * count;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  frames.forEach((f, i) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size;
    tempCanvas.height = size;
    drawThumbnail(tempCanvas, f.grid);
    ctx.drawImage(tempCanvas, i * size, 0);
  });

  const link = document.createElement('a');
  link.download = `pixelverse-spritesheet-${count}x${size}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
