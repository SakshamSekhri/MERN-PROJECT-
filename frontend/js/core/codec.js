/**
 * Grid codec — palette indexing plus run-length encoding.
 *
 * ── Why encode at all ──
 *
 * A 64x64 grid stored as raw JSON is 4,096 strings like "#ff2e88". Measured
 * against this project's own grids:
 *
 *     200 frames @ 32x32   raw 1.58 MB   encoded 0.72 MB
 *     200 frames @ 64x64   raw 6.27 MB   encoded 2.83 MB
 *
 * LocalStorage caps at roughly 5 MB, so the raw 64x64 case fails outright.
 * Encoding is not an optimisation here — it is the difference between saving
 * and losing the user's work.
 *
 * ── Why RLE specifically ──
 *
 * Pixel art is the ideal input for run-length encoding: it is built from
 * large flat regions of identical colour. A photo would compress badly this
 * way; a sprite compresses extremely well. A background filled with one
 * colour collapses from 4,096 entries to a single run.
 *
 * ── Format ──
 *
 *     { s: size, p: [hex, ...], r: [count, index, count, index, ...] }
 *
 * `p` is the palette of distinct colours. `r` is a flat array of alternating
 * run-length and palette index, walking the grid in row-major order.
 * Index -1 means empty (transparent).
 *
 * Flat arrays rather than objects per run: JSON.stringify writes [12,3] as
 * seven characters and {"n":12,"i":3} as fifteen. Over tens of thousands of
 * runs that difference is most of the saving.
 */

/** Marker for an empty cell. Not a palette entry — transparency is not a colour. */
const EMPTY = -1;

/**
 * Encode a 2D grid.
 * @param {(string|null)[][]} grid
 * @returns {{ s: number, p: string[], r: number[] }}
 */
export function encodeGrid(grid) {
  const size = grid.length;
  const palette = [];
  const index = new Map();
  const runs = [];

  let prev = null;     // null means "no run started yet"
  let count = 0;

  for (let y = 0; y < size; y++) {
    const row = grid[y];
    for (let x = 0; x < size; x++) {
      const cell = row[x];

      let id;
      if (cell === null || cell === undefined) {
        id = EMPTY;
      } else if (index.has(cell)) {
        id = index.get(cell);
      } else {
        id = palette.length;
        index.set(cell, id);
        palette.push(cell);
      }

      if (prev === null) {
        prev = id;
        count = 1;
      } else if (id === prev) {
        count++;
      } else {
        runs.push(count, prev);
        prev = id;
        count = 1;
      }
    }
  }

  if (prev !== null) runs.push(count, prev);

  return { s: size, p: palette, r: runs };
}

/**
 * Decode back into a 2D grid.
 *
 * Defensive throughout: saved data can be truncated by a failed write or
 * hand-edited in devtools. A short run list yields a partially filled grid
 * rather than an exception — losing some cells beats losing the project.
 */
export function decodeGrid(data) {
  if (!data || typeof data.s !== 'number' || !Array.isArray(data.r)) return null;

  const size = data.s;
  if (size <= 0 || size > 512) return null;      // sanity bound

  const palette = Array.isArray(data.p) ? data.p : [];
  const grid = Array.from({ length: size }, () => Array(size).fill(null));

  let pos = 0;
  const total = size * size;

  for (let i = 0; i + 1 < data.r.length; i += 2) {
    const count = data.r[i];
    const id = data.r[i + 1];
    if (!Number.isFinite(count) || count <= 0) continue;

    const color = id === EMPTY ? null : (palette[id] ?? null);

    for (let n = 0; n < count && pos < total; n++, pos++) {
      grid[Math.floor(pos / size)][pos % size] = color;
    }
    if (pos >= total) break;
  }

  return grid;
}

/**
 * Journal entries, encoded columnwise.
 *
 * Same idea applied to a different shape. An array of objects repeats every
 * key name on every entry — "seq","t","frameId","x","y","from","to" is about
 * 40 bytes of key names per delta, and a session can hold tens of thousands.
 *
 * Storing each field as its own array drops the key names to seven total,
 * and colours become palette indices instead of repeated hex strings.
 *
 *     { v:1, p:[hex...], seq:[...], t:[...], f:[...], x:[...], y:[...],
 *       a:[from index...], b:[to index...] }
 */
export function encodeJournal(entries) {
  const palette = [];
  const index = new Map();

  const id = hex => {
    if (hex === null || hex === undefined) return EMPTY;
    if (index.has(hex)) return index.get(hex);
    const next = palette.length;
    index.set(hex, next);
    palette.push(hex);
    return next;
  };

  const out = { v: 1, p: palette, seq: [], t: [], f: [], x: [], y: [], a: [], b: [] };

  for (const e of entries) {
    out.seq.push(e.seq ?? 0);
    out.t.push(e.t ?? 0);
    out.f.push(e.frameId ?? 0);
    out.x.push(e.x);
    out.y.push(e.y);
    out.a.push(id(e.from));
    out.b.push(id(e.to));
  }

  return out;
}

/** Rebuild journal entries. Returns [] on anything malformed. */
export function decodeJournal(data) {
  if (!data || !Array.isArray(data.x) || !Array.isArray(data.y)) return [];

  const palette = Array.isArray(data.p) ? data.p : [];
  const hex = i => (i === EMPTY || i == null ? null : (palette[i] ?? null));

  const n = Math.min(data.x.length, data.y.length);
  const out = [];

  for (let i = 0; i < n; i++) {
    out.push({
      seq: data.seq?.[i] ?? i,
      t: data.t?.[i] ?? 0,
      frameId: data.f?.[i] ?? 0,
      x: data.x[i],
      y: data.y[i],
      from: hex(data.a?.[i]),
      to: hex(data.b?.[i]),
    });
  }

  return out;
}

/** Approximate stored size in bytes, for the UI readout. */
export function measure(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return JSON.stringify(value).length;      // close enough for ASCII
  }
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}