/**
 * Export Pro Suite — PixelVerse.
 *
 * Provides single frame image export (PNG, JPEG, BMP) and multi-frame animation export
 * (GIF, WebP, MP4, Sprite Sheet).
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

function downloadBlob(blob, filename) {
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Download a single frame image in PNG, JPEG, or BMP format.
 */
export function downloadSingleFrame(grid, format = 'png', filename = 'pixelverse-artwork', scale = 8) {
  if (!grid) return;
  const bg = format === 'jpeg' ? '#ffffff' : 'transparent';
  const canvas = gridToCanvas(grid, scale, { background: bg });
  if (!canvas) return;

  if (format === 'bmp') {
    downloadBlob(canvasToBmpBlob(canvas), `${filename}.bmp`);
  } else {
    const jpeg = format === 'jpeg';
    canvas.toBlob(blob => downloadBlob(blob, `${filename}.${jpeg ? 'jpg' : 'png'}`),
      jpeg ? 'image/jpeg' : 'image/png', jpeg ? 0.95 : undefined);
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

  canvas.toBlob(blob => downloadBlob(blob, `pixelverse-spritesheet-${count}x${size*scale}.png`), 'image/png');
}

/* ─────────────── GIF Encoder Helper Functions ─────────────── */

function hexToRgb(hex) {
  if (!hex) return null;
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return null;
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHexStr(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function findNearestColorIndex(r, g, b, palette, paletteSize) {
  let minDist = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < paletteSize; i++) {
    const pr = palette[i * 3];
    const pg = palette[i * 3 + 1];
    const pb = palette[i * 3 + 2];
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < minDist) {
      minDist = dist;
      bestIdx = i;
      if (dist === 0) break;
    }
  }
  return bestIdx;
}

/**
 * Standard LZW Encoder conforming to GIF89a specification.
 */
function lzwEncode(width, height, pixels, minCodeSize) {
  const buf = [];
  let curBit = 0;
  let curByte = 0;

  function writeCode(code, codeSize) {
    curByte |= (code << curBit);
    curBit += codeSize;
    while (curBit >= 8) {
      buf.push(curByte & 0xff);
      curByte >>= 8;
      curBit -= 8;
    }
  }

  function flushBits() {
    if (curBit > 0) {
      buf.push(curByte & 0xff);
      curByte = 0;
      curBit = 0;
    }
  }

  const clearCode = 1 << minCodeSize; // 256
  const endCode = clearCode + 1; // 257

  let codeSize = minCodeSize + 1; // 9
  let nextCode = endCode + 1; // 258
  let maxCode = (1 << codeSize); // 512

  let dictionary = new Map();

  function resetDict() {
    dictionary.clear();
    codeSize = minCodeSize + 1;
    nextCode = endCode + 1;
    maxCode = (1 << codeSize);
  }

  // Initial Clear Code
  writeCode(clearCode, codeSize);

  let prefix = pixels[0];

  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = (prefix << 12) | k;

    if (dictionary.has(key)) {
      prefix = dictionary.get(key);
    } else {
      writeCode(prefix, codeSize);

      if (nextCode < 4095) {
        dictionary.set(key, nextCode++);
        if (nextCode > maxCode && codeSize < 12) {
          codeSize++;
          maxCode = (1 << codeSize);
        }
      } else {
        writeCode(clearCode, codeSize);
        resetDict();
      }

      prefix = k;
    }
  }

  writeCode(prefix, codeSize);
  writeCode(endCode, codeSize);
  flushBits();

  // Package bytes into sub-blocks of up to 254 bytes
  const subBlocks = [];
  subBlocks.push(minCodeSize); // LZW Minimum Code Size byte

  let p = 0;
  while (p < buf.length) {
    const chunkLen = Math.min(254, buf.length - p);
    subBlocks.push(chunkLen);
    for (let i = 0; i < chunkLen; i++) {
      subBlocks.push(buf[p++]);
    }
  }
  subBlocks.push(0x00); // Block Terminator

  return subBlocks;
}

/**
 * Export frames as a GIF89a Animated GIF with exact color mapping and standard LZW encoding.
 */
export function downloadAnimatedGif(frames, size, fps = 12, scale = 4, bg = '#0d1017') {
  if (!frames || frames.length === 0) return;
  const width = size * scale;
  const height = size * scale;
  const delayCs = Math.max(1, Math.round(100 / fps));

  const colorMap = new Map();
  const palette = [];

  const bgHex = (bg && bg !== 'transparent') ? bg.toLowerCase() : '#0d1017';
  const bgRgb = hexToRgb(bgHex) || { r: 13, g: 16, b: 23 };
  colorMap.set(bgHex, 0);
  palette.push(bgRgb.r, bgRgb.g, bgRgb.b);

  // Collect all exact unique colors from frames
  frames.forEach(f => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = f.grid[y]?.[x];
        if (c && !colorMap.has(c.toLowerCase())) {
          if (colorMap.size < 256) {
            const rgb = hexToRgb(c);
            if (rgb) {
              colorMap.set(c.toLowerCase(), colorMap.size);
              palette.push(rgb.r, rgb.g, rgb.b);
            }
          }
        }
      }
    }
  });

  while (palette.length < 768) {
    palette.push(0);
  }

  const bytes = [];
  // Header: GIF89a
  bytes.push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

  // Logical Screen Descriptor
  bytes.push(width & 0xff, (width >> 8) & 0xff);
  bytes.push(height & 0xff, (height >> 8) & 0xff);
  bytes.push(0xf7, 0x00, 0x00); // GCT 256 colors

  for (let i = 0; i < 768; i++) {
    bytes.push(palette[i]);
  }

  // Netscape 2.0 Loop Extension
  bytes.push(0x21, 0xff, 0x0b);
  'NETSCAPE2.0'.split('').forEach(c => bytes.push(c.charCodeAt(0)));
  bytes.push(0x03, 0x01, 0x00, 0x00, 0x00);

  frames.forEach(f => {
    const canvas = gridToCanvas(f.grid, scale, { background: bgHex });
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, width, height).data;

    // Graphic Control Extension (GCE)
    bytes.push(
      0x21, 0xf9, 0x04,
      0x04,
      delayCs & 0xff, (delayCs >> 8) & 0xff,
      0x00,
      0x00
    );

    // Image Descriptor
    bytes.push(
      0x2c,
      0, 0,
      0, 0,
      width & 0xff, (width >> 8) & 0xff,
      height & 0xff, (height >> 8) & 0xff,
      0x00
    );

    const indexed = new Uint8Array(width * height);
    const colorCount = colorMap.size;
    for (let p = 0; p < width * height; p++) {
      const pr = imgData[p * 4];
      const pg = imgData[p * 4 + 1];
      const pb = imgData[p * 4 + 2];
      const pa = imgData[p * 4 + 3];

      if (pa < 128) {
        indexed[p] = 0;
      } else {
        const hex = rgbToHexStr(pr, pg, pb);
        if (colorMap.has(hex)) {
          indexed[p] = colorMap.get(hex);
        } else {
          indexed[p] = findNearestColorIndex(pr, pg, pb, palette, colorCount);
        }
      }
    }

    const lzwData = lzwEncode(width, height, indexed, 8);
    for (let i = 0; i < lzwData.length; i++) {
      bytes.push(lzwData[i]);
    }
  });

  bytes.push(0x3b);

  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
  const link = document.createElement('a');
  link.download = `pixelverse-animation-${frames.length}f.gif`;
  link.href = URL.createObjectURL(blob);
  link.click();
}

/**
 * Export frames as an Animated WebP file.
 */
export async function downloadAnimatedWebP(frames, size, fps = 12, scale = 4, bg = 'transparent') {
  if (!frames || frames.length === 0) return;
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const stream = canvas.captureStream(fps);
  let mimeType = 'image/webp';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const frameDelay = 1000 / fps;
  recorder.start();

  for (let loop = 0; loop < 2; loop++) {
    for (let i = 0; i < frames.length; i++) {
      const fc = gridToCanvas(frames[i].grid, scale, { background: bg });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (bg && bg !== 'transparent') {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      if (fc) ctx.drawImage(fc, 0, 0);
      await new Promise(r => setTimeout(r, frameDelay));
    }
  }

  recorder.stop();
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: 'image/webp' });
    const link = document.createElement('a');
    link.download = `pixelverse-animation-${frames.length}f.webp`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };
}

/**
 * Export frames as an MP4 Video file.
 */
export async function downloadMp4Video(frames, size, fps = 12, scale = 8, bg = '#0d1017') {
  if (!frames || frames.length === 0) return;
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const stream = canvas.captureStream(fps);
  let mimeType = 'video/mp4';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4;codecs=avc1';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  const frameDelay = 1000 / fps;
  recorder.start();

  for (let loop = 0; loop < 3; loop++) {
    for (let i = 0; i < frames.length; i++) {
      const fc = gridToCanvas(frames[i].grid, scale, { background: bg || '#0d1017' });
      ctx.fillStyle = bg || '#0d1017';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (fc) ctx.drawImage(fc, 0, 0);
      await new Promise(r => setTimeout(r, frameDelay));
    }
  }

  recorder.stop();
  recorder.onstop = () => {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type: mimeType });
    const link = document.createElement('a');
    link.download = `pixelverse-animation-${frames.length}f.${ext}`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };
}
