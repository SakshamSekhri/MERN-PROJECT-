/**
 * Delta journal — the append-only record of everything that was drawn.
 *
 * ── Why this is not the undo stack ──
 *
 * history.js already stores deltas, so it looks like it could serve as the
 * replay log. It cannot, and the reason matters:
 *
 *     undo(grid) {
 *       const step = this.undoStack.pop();   // <- the record is DESTROYED
 *
 * An undo stack is a stack of things you can still take back. It pops on
 * undo, clears its redo branch on the next action, and is wiped on resize.
 * It answers "what can I reverse from here".
 *
 * A journal answers a different question: "what actually happened". If the
 * artist draws a line, undoes it, then draws a different one, the replay
 * should show BOTH — because both happened. That history is gone from the
 * undo stack the moment they pressed Ctrl+Z.
 *
 * So the two structures coexist:
 *
 *     History  — mutable stack   -> undo / redo
 *     Journal  — append-only log -> replay + persistence
 *
 * ── Shape ──
 *
 * Each entry is one cell change:
 *
 *     { seq, t, frameId, x, y, from, to }
 *
 * seq      monotonic order — the authoritative sequence for replay
 * t        ms since the journal started, for playback at real speed
 * frameId  which frame this belonged to
 * from/to  colour before and after, or null for empty
 *
 * Add userId and swap `t` for a wall-clock timestamp and this is exactly the
 * Phase 2 PixelDelta MongoDB document. Nothing here needs rewriting when the
 * server arrives — it gains fields.
 */

export class Journal {
  /**
   * @param {object} opts
   *   limit  hard cap on entries kept. A 64x64 canvas is 4,096 cells and a
   *          long session can produce tens of thousands of deltas; without
   *          a cap a single sitting could exhaust memory and blow the
   *          LocalStorage quota on save.
   */
  constructor({ limit = 20000 } = {}) {
    this.entries = [];
    this.base = new Map();    // state after deltas trimmed from the front
    this.limit = limit;
    this.seq = 0;
    this.startedAt = Date.now();
    this.truncated = false;   // true once the cap has dropped anything
    this.repaired = false;    // true when an older/incomplete log needed a final-state repair
  }

  get length() { return this.entries.length; }
  get isEmpty() { return this.entries.length === 0; }

  /**
   * Append one committed step (an array of {x,y,from,to} deltas).
   *
   * Steps are flattened into individual cell entries rather than kept as
   * groups. Replay is about watching the art appear cell by cell — a
   * 300-cell flood fill should stream in, not blink into existence.
   */
  push(step, frameId = 0) {
    if (!Array.isArray(step) || step.length === 0) return 0;

    const t = Date.now() - this.startedAt;
    for (const d of step) {
      this.entries.push({
        seq: this.seq++,
        t,
        frameId,
        x: d.x,
        y: d.y,
        from: d.from,
        to: d.to,
      });
    }

    // Keep the state produced by trimmed deltas as a replay starting point.
    if (this.entries.length > this.limit) {
      const dropped = this.entries.splice(0, this.entries.length - this.limit);
      for (const entry of dropped) {
        if (!this.base.has(entry.frameId)) this.base.set(entry.frameId, new Map());
        const cells = this.base.get(entry.frameId);
        const key = `${entry.x},${entry.y}`;
        if (entry.to === null) cells.delete(key);
        else cells.set(key, entry.to);
      }
      this.truncated = true;
    }

    return step.length;
  }

  /** Every entry belonging to one frame, in order. */
  forFrame(frameId) {
    return this.entries.filter(e => e.frameId === frameId);
  }

  /** Distinct frame ids that appear in the journal, in first-seen order. */
  frameIds() {
    const seen = [];
    for (const e of this.entries) if (!seen.includes(e.frameId)) seen.push(e.frameId);
    return seen;
  }

  baseGrid(frameId, size) {
    const grid = Array.from({ length: size }, () => Array(size).fill(null));
    for (const [key, color] of this.base.get(frameId) ?? []) {
      const [x, y] = key.split(',').map(Number);
      if (x >= 0 && x < size && y >= 0 && y < size) grid[y][x] = color;
    }
    return grid;
  }

  exportBase() {
    return [...this.base.entries()].map(([frameId, cells]) => ({
      frameId,
      cells: [...cells.entries()].map(([key, color]) => {
        const [x, y] = key.split(',').map(Number);
        return [x, y, color];
      }),
    }));
  }

  importBase(data) {
    this.base = new Map();
    if (!Array.isArray(data)) return;
    for (const frame of data) {
      if (!Number.isSafeInteger(frame?.frameId) || !Array.isArray(frame.cells)) continue;
      const cells = new Map();
      for (const cell of frame.cells) {
        if (!Array.isArray(cell) || cell.length < 3) continue;
        const [x, y, color] = cell;
        if (Number.isSafeInteger(x) && Number.isSafeInteger(y) && typeof color === 'string') {
          cells.set(`${x},${y}`, color);
        }
      }
      this.base.set(frame.frameId, cells);
    }
  }

  /**
   * Align an incomplete legacy journal with the authoritative saved frames.
   * Repair entries preserve its existing history and make the final replay
   * state accurate; they cannot recover edits that were never recorded.
   */
  reconcileFrames(frames) {
    const replayed = new Map([...this.base.entries()].map(([id, cells]) => [id, new Map(cells)]));
    for (const entry of this.entries) {
      if (!replayed.has(entry.frameId)) replayed.set(entry.frameId, new Map());
      replayed.get(entry.frameId).set(`${entry.x},${entry.y}`, entry.to);
    }

    let repaired = 0;
    for (const frame of frames) {
      const observed = replayed.get(frame.id) ?? new Map();
      const desired = new Map();
      for (let y = 0; y < frame.grid.length; y++) {
        for (let x = 0; x < frame.grid[y].length; x++) {
          const color = frame.grid[y][x];
          if (color !== null) desired.set(`${x},${y}`, color);
        }
      }

      const correction = [];
      for (const key of new Set([...observed.keys(), ...desired.keys()])) {
        const from = observed.get(key) ?? null;
        const to = desired.get(key) ?? null;
        if (from === to) continue;
        const [x, y] = key.split(',').map(Number);
        correction.push({ x, y, from, to });
      }
      repaired += this.push(correction, frame.id);
    }
    if (repaired) this.repaired = true;
    return repaired;
  }

  clear() {
    this.entries.length = 0;
    this.base.clear();
    this.seq = 0;
    this.startedAt = Date.now();
    this.truncated = false;
    this.repaired = false;
  }

  /** Plain object for LocalStorage. */
  toJSON() {
    return {
      version: 1,
      startedAt: this.startedAt,
      truncated: this.truncated,
      repaired: this.repaired,
      entries: this.entries,
      base: this.exportBase(),
    };
  }

  /** Rebuild from a saved object. Tolerates missing or malformed data. */
  static fromJSON(data, opts = {}) {
    const j = new Journal(opts);
    if (!data || !Array.isArray(data.entries)) return j;

    j.entries = data.entries.filter(
      e => e && typeof e.x === 'number' && typeof e.y === 'number'
    );
    j.importBase(data.base);
    j.startedAt = data.startedAt ?? Date.now();
    j.truncated = Boolean(data.truncated);
    j.repaired = Boolean(data.repaired);
    j.seq = j.entries.length ? Math.max(...j.entries.map(e => e.seq ?? 0)) + 1 : 0;
    return j;
  }
}
