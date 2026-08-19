/**
 * Undo / redo, built on deltas rather than snapshots.
 *
 * This is deliberate. Storing a full 64×64 grid copy per action would be
 * 4,096 cells per step; instead each step records only the cells that
 * actually changed:
 *
 *     { x, y, from: '#ff2e88', to: null }
 *
 * Undo = re-apply `from`. Redo = re-apply `to`.
 *
 * One user gesture (a drag stroke, a fill) is one *step* containing many
 * deltas, so undo reverses the whole stroke instead of one cell at a time.
 *
 * This shape is the Phase 1 ancestor of the Phase 2 PixelDelta document —
 * add userId + timestamp and it becomes the server-side record that powers
 * version history and replay. Building it this way now means Phase 2 is an
 * extension, not a rewrite.
 */

export class History {
  constructor(limit = 200) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
  }
  static onAnyCommit=null;

  /** Open a step. Deltas recorded until commit() belong to it. */
  begin() {
    this.pending = [];
  }

  /** Record one cell change. Ignores no-ops so undo never wastes a step. */
  record(x, y, from, to) {
    if (!this.pending || from === to) return;
    this.pending.push({ x, y, from, to });
  }

  /** Close the step. Empty steps are discarded. */
  commit() {
    if (!this.pending || this.pending.length === 0) {
      this.pending = null;
      return false;
    }
    if (History.onAnyCommit) {
      try {
        History.onAnyCommit(this.pending, this);
      } catch (err) {
        // A broken journal must never break drawing.
        console.warn('[history] journal hook threw', err);
      }
    }
    this.undoStack.push(this.pending);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;   // a new action invalidates the redo branch
    this.pending = null;
    return true;
  }

  undo(grid) {
    const step = this.undoStack.pop();
    if (!step) return false;
    for (let i = step.length - 1; i >= 0; i--) {
      const d = step[i];
      grid[d.y][d.x] = d.from;
    }
    this.redoStack.push(step);
    return true;
  }

  redo(grid) {
    const step = this.redoStack.pop();
    if (!step) return false;
    for (const d of step) grid[d.y][d.x] = d.to;
    this.undoStack.push(step);
    return true;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get steps()   { return this.undoStack.length; }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.pending = null;
  }
}