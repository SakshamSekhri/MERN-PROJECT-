/**
 * Project persistence — save and restore the whole working state.
 *
 * Two things are saved, and both matter:
 *
 *   frames   the artwork
 *   journal  how it was made — the delta log that powers replay
 *
 * Saving only the frames would silently throw away the replay. The brief is
 * explicit that LocalStorage holds the delta history array, so the journal is
 * a first-class part of the save, not a nice-to-have.
 *
 * ── Quota is a real failure mode, not a theoretical one ──
 *
 * LocalStorage caps around 5 MB and throws QuotaExceededError on overflow.
 * Losing an hour of drawing because a save silently failed is the worst
 * outcome this module can produce, so writes degrade in steps rather than
 * failing outright:
 *
 *   1. frames + journal          (everything)
 *   2. frames only               (replay lost, artwork safe)
 *   3. report failure to the UI  (nothing written, user told)
 *
 * The artwork is always the last thing sacrificed.
 */

import { save as rawSave, load as rawLoad, remove as rawRemove } from './storage.js';
import {
  encodeGrid, decodeGrid, encodeJournal, decodeJournal, measure,
} from './codec.js';
import { Journal } from './journal.js';
import { History } from '../canvas/history.js';
import { reserveFrameIds } from '../frames/frameManager.js';

export const SLOT_DEFAULT = 'project';
export const SLOT_BLANK = 'project_blank';
export const SLOT_IMAGE = 'project_image';

export const FORMAT_VERSION = 2;

/**
 * Build the saveable object.
 *
 * Frames are encoded; History objects are deliberately NOT saved. An undo
 * stack is a live editing artifact — restoring yesterday's undo history would
 * let a user "undo" past the point they saved, into a state that no longer
 * matches anything on screen. Each restored frame gets a fresh History.
 */
export function serialise({ frames, journal, gridSize, fps, loop, activeFrame, reference }) {
  journal?.reconcileFrames?.(frames);
  return {
    v: FORMAT_VERSION,
    savedAt: Date.now(),
    gridSize,
    fps: fps ?? 12,
    loop: loop ?? true,
    activeFrame: activeFrame ?? 0,
    frames: frames.map(f => ({ id: f.id, g: encodeGrid(f.grid) })),
    journal: journal ? encodeJournal(journal.entries) : null,
    journalBase: journal?.exportBase?.() ?? null,
    journalMeta: journal ? {
      startedAt: journal.startedAt,
      truncated: journal.truncated,
      repaired: journal.repaired,
    } : null,
    reference: reference && reference.grid ? {
      g: encodeGrid(reference.grid),
      palette: reference.palette || [],
      options: reference.options || null,
    } : null,
  };
}

/**
 * Rebuild state from a saved object.
 *
 * Every field is defended. Saved data can be truncated by a failed write,
 * left behind by an older version of the app, or edited by hand in devtools.
 * A partially readable project is worth far more than a thrown exception.
 */
export function deserialise(data) {
  if (!data || !Array.isArray(data.frames)) return null;

  const frames = [];
  const usedIds = new Set();
  let replacementId = data.frames.reduce((max, frame) =>
    Number.isSafeInteger(frame?.id) && frame.id > max ? frame.id : max, 0
  ) + 1;
  for (const entry of data.frames) {
    const grid = decodeGrid(entry?.g);
    if (!grid) continue;                       // skip corrupt frames, keep the rest
    let id = entry.id;
    if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) id = replacementId++;
    usedIds.add(id);
    frames.push({
      id,
      grid,
      history: new History(),                  // fresh — see note in serialise()
    });
  }

  if (frames.length === 0) return null;
  reserveFrameIds(frames);

  const journal = new Journal();
  journal.importBase(data.journalBase);
  if (data.journal) {
    journal.entries = decodeJournal(data.journal);
    journal.seq = journal.entries.length
      ? Math.max(...journal.entries.map(e => e.seq ?? 0)) + 1
      : 0;
  }
  const latestRecordedTime = journal.entries.reduce((max, entry) =>
    Math.max(max, Number.isFinite(entry.t) ? entry.t : 0), 0
  );
  journal.startedAt = data.journalMeta?.startedAt ?? Date.now() - latestRecordedTime;
  journal.truncated = Boolean(data.journalMeta?.truncated || data.journalDropped);
  journal.repaired = Boolean(data.journalMeta?.repaired || data.journalDropped);
  journal.reconcileFrames(frames);

  let reference = null;
  if (data.reference && data.reference.g) {
    const refGrid = decodeGrid(data.reference.g);
    if (refGrid) {
      reference = {
        grid: refGrid,
        palette: data.reference.palette || [],
        options: data.reference.options || {},
        image: null,
      };
    }
  }

  return {
    frames,
    journal,
    gridSize: data.gridSize ?? frames[0].grid.length,
    fps: data.fps ?? 12,
    loop: data.loop ?? true,
    activeFrame: Math.max(0, Math.min(data.activeFrame ?? 0, frames.length - 1)),
    reference,
    savedAt: data.savedAt ?? null,
  };
}

/**
 * Write to LocalStorage, degrading rather than failing.
 * @returns {{ ok, bytes, degraded, error }}
 */
export function saveProject(state, slot = SLOT_BLANK) {
  const full = serialise(state);
  const bytes = measure(full);

  if (rawSave(slot, full)) {
    return { ok: true, bytes, degraded: false, error: null };
  }

  // Most likely the journal pushed it over. Drop it and keep the artwork.
  const withoutJournal = {
    ...full,
    journal: null,
    journalBase: null,
    journalMeta: null,
    journalDropped: true,
  };
  if (rawSave(slot, withoutJournal)) {
    return {
      ok: true,
      bytes: measure(withoutJournal),
      degraded: true,
      error: 'Replay history was too large to save — your artwork was saved.',
    };
  }

  return {
    ok: false,
    bytes,
    degraded: false,
    error: 'Not enough storage space. Try fewer frames or a smaller grid.',
  };
}

/** Read and rebuild. Returns null when there is nothing saved or it is unusable. */
export function loadProject(slot = SLOT_BLANK) {
  let raw = rawLoad(slot, null);
  if (!raw && slot === SLOT_BLANK) {
    raw = rawLoad(SLOT_DEFAULT, null);
  }
  if (!raw) return null;
  try {
    return deserialise(raw);
  } catch (err) {
    console.warn('[project] saved data unreadable', err);
    return null;
  }
}

/** Metadata without decoding the whole thing — for a "restore?" prompt. */
export function peekProject(slot = SLOT_BLANK) {
  let raw = rawLoad(slot, null);
  if (!raw && slot === SLOT_BLANK) {
    raw = rawLoad(SLOT_DEFAULT, null);
  }
  if (!raw || !Array.isArray(raw.frames)) return null;

  const hasPaintedCells = raw.frames.some(f => {
    if (!f) return false;
    if (f.g && Array.isArray(f.g.p)) return f.g.p.length > 0;
    if (Array.isArray(f.grid)) return f.grid.some(r => Array.isArray(r) && r.some(c => c !== null));
    return false;
  });

  const hasJournal = Boolean(
    raw.journal &&
    ((Array.isArray(raw.journal.x) && raw.journal.x.length > 0) ||
     (Array.isArray(raw.journal.entries) && raw.journal.entries.length > 0))
  );

  const hasReference = Boolean(
    raw.reference &&
    ((raw.reference.g && Array.isArray(raw.reference.g.p) && raw.reference.g.p.length > 0) ||
     (Array.isArray(raw.reference.grid) && raw.reference.grid.some(r => Array.isArray(r) && r.some(c => c !== null))))
  );

  // If the canvas/project is completely empty, don't prompt to restore
  if (!hasPaintedCells && !hasJournal && !hasReference) {
    return null;
  }

  return {
    frames: raw.frames.length,
    gridSize: raw.gridSize ?? null,
    savedAt: raw.savedAt ?? null,
    hasJournal,
    bytes: measure(raw),
  };
}

export function clearProject(slot = SLOT_BLANK) {
  rawRemove(slot);
  if (slot === SLOT_BLANK) {
    rawRemove(SLOT_DEFAULT);
  }
}

/**
 * Debounced autosave.
 *
 * Saving on every committed delta would serialise and stringify the entire
 * project hundreds of times during a single drag. Debouncing collapses a
 * burst of edits into one write once the user pauses.
 */
export function makeAutosave(getState, { delay = 1500, onResult = null, slot = SLOT_BLANK } = {}) {
  let timer = null;

  const run = () => {
    timer = null;
    const result = saveProject(getState(), slot);
    if (onResult) onResult(result);
  };

  return {
    schedule() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(run, delay);
    },
    /** Force an immediate write — used on page unload. */
    flush() {
      if (timer === null) return false;
      clearTimeout(timer);
      run();
      return true;
    },
    cancel() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
    },
  };
}

/** "just now", "4 min ago", "2 h ago" — for the save readout. */
export function describeAge(timestamp) {
  if (!timestamp) return 'never';
  const secs = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  return `${Math.round(secs / 3600)} h ago`;
}
