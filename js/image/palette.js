/**
 * Colour maths for the pixelation pipeline.
 *
 * Every function here is pure — no canvas, no DOM — which is why the whole
 * module is testable in plain Node.
 *
 * The interesting part is palette reduction. A downscaled photo is not pixel
 * art: it still contains hundreds of near-identical shades, so it reads as a
 * small blurry photo. Real pixel art uses a deliberately limited palette.
 * Reducing the colour count is what makes the output look *designed*.
 */

/* ─────────────── conversion ─────────────── */

export function rgbToHex({ r, g, b }) {
  const h = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/* ─────────────── distance ─────────────── */

/**
 * Perceptual colour distance, squared.
 *
 * Plain Euclidean RGB distance treats all three channels as equally
 * important, but human vision does not: we resolve green far better than
 * blue, so two greens that differ by 20 look further apart than two blues
 * that differ by 20.
 *
 * This is the "redmean" approximation — cheap, no colour-space conversion,
 * and markedly closer to perception than raw RGB. It weights the channels
 * by the average redness of the two colours being compared.
 *
 * Returned squared: we only ever compare distances, and skipping the square
 * root saves a call per comparison inside the nearest-colour loop.
 */
export function colorDistance(a, b) {
  const rmean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return (
    (((512 + rmean) * dr * dr) >> 8) +
    4 * dg * dg +
    (((767 - rmean) * db * db) >> 8)
  );
}

/** The palette entry closest to `color`. */
export function nearestColor(color, palette) {
  let best = palette[0];
  let bestDist = Infinity;
  for (const candidate of palette) {
    const d = colorDistance(color, candidate);
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return best;
}

/* ─────────────── quantisation ─────────────── */

/**
 * Crude reduction: round each channel to a fixed number of steps.
 *
 * Fast and needs no analysis of the image, but it snaps to an arbitrary grid
 * of colours that may not include any colour the image actually contains.
 * Kept as an option because it is instant and sometimes gives a pleasingly
 * harsh retro look.
 */
export function quantizeChannels(color, levels = 8) {
  const step = 255 / (levels - 1);
  return {
    r: Math.round(Math.round(color.r / step) * step),
    g: Math.round(Math.round(color.g / step) * step),
    b: Math.round(Math.round(color.b / step) * step),
  };
}

/* ─────────────── median cut ─────────────── */

/**
 * Derive a palette of `size` colours from the image itself, via median cut.
 *
 * The algorithm:
 *   1. Put every pixel in one box.
 *   2. Find the box with the widest spread in any single channel.
 *   3. Sort that box's pixels along that channel and split at the median.
 *   4. Repeat until there are `size` boxes.
 *   5. Average each box — those averages are the palette.
 *
 * Splitting at the *median* rather than the midpoint is what makes this work:
 * each split divides the pixels evenly, so a colour occupying a large area of
 * the image earns proportionally more palette entries. A midpoint split would
 * hand equal weight to a colour covering one pixel and one covering half the
 * image.
 *
 * `size` is rounded down to a power of two, since each pass doubles the box
 * count. Asking for 12 gives you 8.
 */
export function medianCut(colors, size = 16) {
  if (colors.length === 0) return [];
  if (size < 2) return [averageColor(colors)];

  let boxes = [colors];

  while (boxes.length < size) {
    const target = widestBox(boxes);
    if (target === -1) break;              // every box is a single colour

    const box = boxes[target];
    const channel = widestChannel(box);
    const sorted = [...box].sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(sorted.length / 2);

    const left = sorted.slice(0, mid);
    const right = sorted.slice(mid);
    if (left.length === 0 || right.length === 0) break;

    boxes.splice(target, 1, left, right);
  }

  return boxes.map(averageColor);
}

/** Index of the box with the largest single-channel spread, or -1. */
function widestBox(boxes) {
  let best = -1;
  let bestRange = 0;
  boxes.forEach((box, i) => {
    if (box.length < 2) return;
    const range = channelRange(box, widestChannel(box));
    if (range > bestRange) {
      bestRange = range;
      best = i;
    }
  });
  return best;
}

function widestChannel(box) {
  let best = 'r';
  let bestRange = -1;
  for (const channel of ['r', 'g', 'b']) {
    const range = channelRange(box, channel);
    if (range > bestRange) {
      bestRange = range;
      best = channel;
    }
  }
  return best;
}

function channelRange(box, channel) {
  let min = Infinity;
  let max = -Infinity;
  for (const c of box) {
    if (c[channel] < min) min = c[channel];
    if (c[channel] > max) max = c[channel];
  }
  return max - min;
}

export function averageColor(colors) {
  let r = 0, g = 0, b = 0;
  for (const c of colors) { r += c.r; g += c.g; b += c.b; }
  const n = colors.length;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/* ─────────────── palette application ─────────────── */

/**
 * Snap every cell of a grid to its nearest palette colour.
 *
 * Returns a new grid; the input is untouched. Empty cells stay empty —
 * transparency is not a colour to be matched.
 */
export function applyPalette(grid, palette) {
  const rgbPalette = palette.map(p => (typeof p === 'string' ? hexToRgb(p) : p));
  const cache = new Map();      // hex → hex, since photos repeat colours heavily

  return grid.map(row => row.map(cell => {
    if (cell === null) return null;
    if (cache.has(cell)) return cache.get(cell);
    const snapped = rgbToHex(nearestColor(hexToRgb(cell), rgbPalette));
    cache.set(cell, snapped);
    return snapped;
  }));
}

/** Every distinct colour in a grid, as hex strings. */
export function uniqueColors(grid) {
  const seen = new Set();
  for (const row of grid) {
    for (const cell of row) if (cell !== null) seen.add(cell);
  }
  return [...seen];
}