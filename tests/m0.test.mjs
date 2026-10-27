import test from 'node:test';
import assert from 'node:assert/strict';

import { History } from '../frontend/js/canvas/history.js';
import { Journal } from '../frontend/js/core/journal.js';
import { makeFrame, addFrame, resizeAllFrames } from '../frontend/js/frames/frameManager.js';
import { gridAt } from '../frontend/js/replay/replay.js';
import {
  serialise, deserialise, saveProject, loadProject, makeAutosave, SLOT_BLANK,
} from '../frontend/js/core/project.js';
import { saveRecovery, listRecoveries, deleteRecovery } from '../frontend/js/core/localRecovery.js';

function finalGrid(journal, frame, size) {
  const entries = journal.forFrame(frame.id);
  return gridAt(entries, entries.length, size, null, journal.baseGrid(frame.id, size)).grid;
}

test('unload flush does not replace an untouched saved project', () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const frame = makeFrame(2);
  frame.grid[0][0] = '#ff2e88';
  assert.equal(saveProject({ frames: [frame], journal: new Journal(), gridSize: 2 }, SLOT_BLANK).ok, true);
  const before = values.get('pixelverse:project_blank');
  const autosave = makeAutosave(() => ({
    frames: [makeFrame(2)], journal: new Journal(), gridSize: 2,
  }), { slot: SLOT_BLANK, delay: 60000 });
  assert.equal(autosave.flush(), false);
  assert.equal(values.get('pixelverse:project_blank'), before);
  autosave.schedule();
  assert.equal(autosave.flush(), true);
  assert.notEqual(values.get('pixelverse:project_blank'), before);
});

test('opening multiple cloud projects retains separate local artwork and replay copies', () => {
  const values = new Map();
  globalThis.localStorage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  const first = makeFrame(2);
  first.grid[0][0] = '#ff2e88';
  const firstJournal = new Journal();
  firstJournal.push([{ x: 0, y: 0, from: null, to: '#ff2e88' }], first.id);
  const firstSlot = saveRecovery({ frames: [first], journal: firstJournal, gridSize: 2 });
  const second = makeFrame(2);
  second.grid[1][1] = '#22d3ee';
  const secondSlot = saveRecovery({ frames: [second], journal: new Journal(), gridSize: 2 });
  assert.notEqual(firstSlot, secondSlot);
  assert.equal(listRecoveries().length, 2);
  const recovered = loadProject(firstSlot);
  assert.equal(recovered.frames[0].grid[0][0], '#ff2e88');
  assert.equal(recovered.journal.entries.length, 1);
  assert.equal(loadProject(secondSlot).frames[0].grid[1][1], '#22d3ee');
  assert.throws(() => deleteRecovery(SLOT_BLANK), /Invalid local recovery copy/);
  deleteRecovery(firstSlot);
  assert.equal(loadProject(firstSlot), null);
  assert.equal(listRecoveries().length, 1);
  assert.equal(loadProject(secondSlot).frames[0].grid[1][1], '#22d3ee');
});

test('restored and legacy duplicate frame IDs cannot collide with new frames', () => {
  const first = makeFrame(2);
  const second = makeFrame(2);
  first.id = 10000;
  second.id = 10000;
  const saved = serialise({ frames: [first, second], journal: new Journal(), gridSize: 2 });
  saved.v = 1;
  delete saved.journalMeta;
  const restored = deserialise(saved);
  addFrame(restored.frames, 1, 2);
  const ids = restored.frames.map(frame => frame.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids[2] > 10000);
});

test('commits, undo and redo replay on their owning frames in order', () => {
  const frames = [makeFrame(2), makeFrame(2)];
  const journal = new Journal();
  History.onAnyCommit = (step, history) => {
    const frame = frames.find(item => item.history === history);
    journal.push(step, frame.id);
  };
  try {
    const [a, b] = frames;
    a.history.begin();
    a.history.record(0, 0, null, '#ff2e88');
    a.grid[0][0] = '#ff2e88';
    a.history.commit();
    b.history.begin();
    b.history.record(1, 1, null, '#22d3ee');
    b.grid[1][1] = '#22d3ee';
    b.history.commit();
    a.history.undo(a.grid);
    assert.deepEqual(finalGrid(journal, a, 2), a.grid);
    assert.deepEqual(finalGrid(journal, b, 2), b.grid);
    a.history.redo(a.grid);
    assert.deepEqual(finalGrid(journal, a, 2), a.grid);
    assert.equal(journal.forFrame(a.id).length, 3);
    assert.equal(journal.forFrame(b.id).length, 1);
  } finally {
    History.onAnyCommit = null;
  }
});

test('duplicate and resize operations leave replay at the same pixels', () => {
  const journal = new Journal();
  const frames = [makeFrame(3)];
  frames[0].grid[2][2] = '#ff2e88';
  journal.reconcileFrames(frames);
  addFrame(frames, 0, 3, 'duplicate', journal);
  assert.deepEqual(finalGrid(journal, frames[1], 3), frames[1].grid);
  resizeAllFrames(frames, 2, journal);
  resizeAllFrames(frames, 3, journal);
  for (const frame of frames) assert.deepEqual(finalGrid(journal, frame, 3), frame.grid);
});

test('legacy missing undo events are repaired without changing the saved art', () => {
  const frame = makeFrame(2);
  const journal = new Journal();
  journal.push([{ x: 0, y: 0, from: null, to: '#ff2e88' }], frame.id);
  const legacy = serialise({ frames: [frame], journal: null, gridSize: 2 });
  legacy.v = 1;
  legacy.journal = {
    v: 1, p: ['#ff2e88'], seq: [0], t: [1000], f: [frame.id],
    x: [0], y: [0], a: [-1], b: [0],
  };
  delete legacy.journalMeta;
  const restored = deserialise(legacy);
  assert.equal(restored.journal.repaired, true);
  assert.ok(restored.journal.entries[1].t >= 1000);
  assert.deepEqual(finalGrid(restored.journal, restored.frames[0], 2), restored.frames[0].grid);
  const backup = serialise(restored);
  assert.equal(backup.v, 2);
  assert.equal(backup.journalMeta.repaired, true);
  assert.equal(backup.journal.x.length, 2);
});

test('trimmed history retains a starting state and reaches the final grid after restore', () => {
  const frame = makeFrame(3);
  const journal = new Journal({ limit: 2 });
  for (let x = 0; x < 3; x++) {
    frame.grid[0][x] = '#ff2e88';
    journal.push([{ x, y: 0, from: null, to: '#ff2e88' }], frame.id);
  }
  assert.equal(journal.truncated, true);
  assert.deepEqual(finalGrid(journal, frame, 3), frame.grid);
  const restored = deserialise(serialise({ frames: [frame], journal, gridSize: 3 }));
  assert.deepEqual(finalGrid(restored.journal, restored.frames[0], 3), restored.frames[0].grid);
  assert.equal(restored.journal.baseGrid(frame.id, 3)[0][0], '#ff2e88');
});

test('storage quota fallback keeps artwork and drops every history payload', () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (value.length > 350) throw new Error('quota');
      values.set(key, value);
    },
    removeItem: key => values.delete(key),
  };
  const frame = makeFrame(2);
  frame.grid[0][0] = '#ff2e88';
  const journal = new Journal();
  for (let i = 0; i < 30; i++) {
    journal.push([{ x: 0, y: 0, from: null, to: '#ff2e88' }], frame.id);
  }
  const originalWarn = console.warn;
  let result;
  try {
    console.warn = () => {}; // the simulated quota failure is expected
    result = saveProject({ frames: [frame], journal, gridSize: 2 }, SLOT_BLANK);
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(result.ok, true);
  assert.equal(result.degraded, true);
  const saved = JSON.parse(values.get('pixelverse:project_blank'));
  assert.equal(saved.journal, null);
  assert.equal(saved.journalBase, null);
  assert.equal(saved.journalMeta, null);
  assert.equal(deserialise(saved).frames[0].grid[0][0], '#ff2e88');
});
