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
    this.limit = limit;
    this.seq = 0;
    this.startedAt = Date.now();
    this.truncated = false;   // true once the cap has dropped anything
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

    // Drop from the front when over cap. Losing the oldest deltas degrades
    // replay gracefully (it starts partway through) rather than failing.
    if (this.entries.length > this.limit) {
      this.entries.splice(0, this.entries.length - this.limit);
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

  clear() {
    this.entries.length = 0;
    this.seq = 0;
    this.startedAt = Date.now();
    this.truncated = false;
  }

  /** Plain object for LocalStorage. */
  toJSON() {
    return {
      version: 1,
      startedAt: this.startedAt,
      truncated: this.truncated,
      entries: this.entries,
    };
  }

  /** Rebuild from a saved object. Tolerates missing or malformed data. */
  static fromJSON(data, opts = {}) {
    const j = new Journal(opts);
    if (!data || !Array.isArray(data.entries)) return j;

    j.entries = data.entries.filter(
      e => e && typeof e.x === 'number' && typeof e.y === 'number'
    );
    j.startedAt = data.startedAt ?? Date.now();
    j.truncated = Boolean(data.truncated);
    j.seq = j.entries.length ? Math.max(...j.entries.map(e => e.seq ?? 0)) + 1 : 0;
    return j;
  }
}