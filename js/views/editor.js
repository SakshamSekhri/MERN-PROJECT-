/**
 * Pixel editor view controller.
 *
 * Thin by design: it owns DOM wiring and pointer handling, and delegates all
 * real work to canvas/* and frames/*. When the reference split-view arrives
 * in Milestone 6 it reuses these same modules rather than duplicating logic.
 */

import {
  state, PALETTE, pushRecentColor,
  currentFrame, currentGrid, currentHistory,
} from '../core/state.js';
import { countFilled } from '../canvas/grid.js';
import { Renderer, drawThumbnail } from '../canvas/renderer.js';
import { resolveOnion, hasPreviousFrame } from '../canvas/onionSkin.js';
import { pencil, eraser, fill, pick } from '../canvas/tools.js';
import {
  makeFrame, addFrame, deleteFrame, moveFrame, resizeAllFrames,
} from '../frames/frameManager.js';
import { Timeline } from '../frames/timeline.js';
import { go } from '../core/router.js';

let renderer, timeline;
let painting = false;
let lastCell = { x: -1, y: -1 };

export function initEditor() {
  const canvas = document.getElementById('paint-canvas');
  renderer = new Renderer(canvas);
  bindColor();
  bindFrames();
  bindOnion();
  bindKeyboard();

  // Start with exactly one frame — the editor is never in a zero-frame state.
  state.frames = [makeFrame(state.gridSize)];
  state.activeFrame = 0;

  timeline = new Timeline(document.getElementById('timeline'), {
    onSelect: selectFrame,
    onReorder: reorderFrame,
  });

  buildPalette();
  bindTools();
  bindPointer(canvas);
  bindTopbar();
  bindHistory();
  bindColor();
  bindFrames();
  bindKeyboard();

  setColor(state.color);
  redraw();
}

/* ─────────────── rendering ─────────────── */

/** Repaint the canvas and every readout that depends on the active frame. */
function redraw({ timelineToo = true } = {}) {
  const grid = currentGrid();
  const history = currentHistory();

  const onion = resolveOnion(state.frames, state.activeFrame, {
  enabled: state.onionEnabled,
  opacity: state.onionOpacity,
});

renderer.draw(grid, { showGridLines: state.showGridLines, onion });
updateOnionUI();

  document.getElementById('stat-filled').textContent = countFilled(grid);
  document.getElementById('stat-steps').textContent = history.steps;
  document.getElementById('stat-frame').textContent =
    `${state.activeFrame + 1} / ${state.frames.length}`;

  document.getElementById('btn-undo').disabled = !history.canUndo;
  document.getElementById('btn-redo').disabled = !history.canRedo;
  document.getElementById('btn-frame-delete').disabled = state.frames.length <= 1;
// The studio opens with any number of frames — you can duplicate and
  // arrange in there too. Only playback needs 2+, and the Play button
  // disables itself.
  const studioBtn = document.getElementById('btn-studio');
  studioBtn.disabled = false;
  studioBtn.title = state.frames.length < 2
    ? 'Open the studio — add a frame to play an animation'
    : 'Open the animation studio';
  if (timelineToo) timeline.render(state.frames, state.activeFrame);
}

/**
 * Cheap path for mid-stroke repaints.
 *
 * Rebuilding the whole timeline on every painted cell would destroy and
 * recreate every thumbnail element sixty times a second — and would kill an
 * in-progress drag. Instead repaint only the active frame's thumbnail in
 * place.
 */
function redrawFast() {
  redraw({ timelineToo: false });
  const thumb = document.querySelector(
    `.frame-item[data-index="${state.activeFrame}"] canvas`
  );
  if (thumb) drawThumbnail(thumb, currentGrid());
}

/* ─────────────── frames ─────────────── */

function selectFrame(index) {
  if (index === state.activeFrame) return;
  if (index < 0 || index >= state.frames.length) return;
  state.activeFrame = index;
  redraw();
}

function reorderFrame(from, to) {
  const wasActive = state.frames[state.activeFrame];
  moveFrame(state.frames, from, to);
  // Follow the frame the user was editing rather than holding the old index.
  state.activeFrame = state.frames.indexOf(wasActive);
  redraw();
}

function bindFrames() {
  document.getElementById('btn-frame-empty').addEventListener('click', () => {
    state.activeFrame = addFrame(state.frames, state.activeFrame, state.gridSize, 'empty');
    redraw();
  });

  document.getElementById('btn-frame-dupe').addEventListener('click', () => {
    state.activeFrame = addFrame(state.frames, state.activeFrame, state.gridSize, 'duplicate');
    redraw();
  });

  document.getElementById('btn-frame-delete').addEventListener('click', () => {
    const next = deleteFrame(state.frames, state.activeFrame);
    if (next === null) return;          // last frame — refused
    state.activeFrame = next;
    redraw();
  });
}




/* ─────────────── onion skin ─────────────── */

function bindOnion() {
  const toggle = document.getElementById('btn-onion');
  const slider = document.getElementById('onion-opacity');

  toggle.addEventListener('click', () => {
    state.onionEnabled = !state.onionEnabled;
    redraw({ timelineToo: false });
  });

  slider.addEventListener('input', e => {
    state.onionOpacity = Number(e.target.value) / 100;
    redraw({ timelineToo: false });
  });
}

/** Keep the toggle, slider and hint honest about what is actually showing. */
function updateOnionUI() {
  const toggle = document.getElementById('btn-onion');
  const slider = document.getElementById('onion-opacity');
  const readout = document.getElementById('onion-readout');
  const hint = document.getElementById('onion-hint');

  const available = hasPreviousFrame(state.activeFrame);

  toggle.classList.toggle('is-on', state.onionEnabled && available);
  slider.value = Math.round(state.onionOpacity * 100);
  slider.disabled = !state.onionEnabled;
  readout.textContent = `${Math.round(state.onionOpacity * 100)}%`;

  // Say why nothing is showing rather than leaving the artist guessing.
  hint.textContent = !available
    ? 'Frame 1 has nothing before it'
    : state.onionEnabled
      ? `Ghosting frame ${state.activeFrame}`
      : 'Off';
}


/* ─────────────── palette ─────────────── */

function buildPalette() {
  const wrap = document.getElementById('palette');
  wrap.innerHTML = '';
  PALETTE.forEach(hex => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = hex;
    b.title = hex;
    b.addEventListener('click', () => setColor(hex));
    wrap.appendChild(b);
  });
}

function renderRecent() {
  const wrap = document.getElementById('recent');
  wrap.innerHTML = '';
  state.recentColors.forEach(hex => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = hex;
    b.title = hex;
    b.addEventListener('click', () => setColor(hex));
    wrap.appendChild(b);
  });
}

function setColor(hex) {
  state.color = hex;
  document.getElementById('active-chip').style.background = hex;
  document.getElementById('active-hex').textContent = hex.toUpperCase();
  document.getElementById('custom-color').value = hex;

  document.querySelectorAll('#palette .swatch').forEach(s => {
    s.classList.toggle('is-active', rgbToHex(s.style.background) === hex.toLowerCase());
  });
}

/** Browsers normalise inline background to rgb(); convert back to compare. */
function rgbToHex(rgb) {
  const m = rgb.match(/\d+/g);
  if (!m) return rgb;
  return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
}

/* ─────────────── tools ─────────────── */

function bindTools() {
  document.querySelectorAll('.tool').forEach(btn => {
    btn.addEventListener('click', () => selectTool(btn.dataset.tool));
  });
}

function selectTool(tool) {
  state.tool = tool;
  document.querySelectorAll('.tool').forEach(b => {
    b.classList.toggle('is-active', b.dataset.tool === tool);
  });
}

/* ─────────────── pointer ─────────────── */

function bindPointer(canvas) {
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = renderer.toCell(e, state.gridSize);

    // Picker is a read, not an edit — no history step.
    if (state.tool === 'picker') {
      const c = pick(currentGrid(), x, y);
      if (c) { setColor(c); pushRecentColor(c); renderRecent(); }
      return;
    }

    painting = true;
    currentHistory().begin();
    lastCell = { x: -1, y: -1 };
    stroke(x, y);
  });

  canvas.addEventListener('pointermove', e => {
    const { x, y } = renderer.toCell(e, state.gridSize);
    document.getElementById('stat-cell').textContent =
      x >= 0 && y >= 0 && x < state.gridSize && y < state.gridSize ? `${x}, ${y}` : '—';
    if (painting) stroke(x, y);
  });

  const end = () => {
    if (!painting) return;
    painting = false;
    if (currentHistory().commit()) redraw();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    document.getElementById('stat-cell').textContent = '—';
  });
}

/**
 * One cell of a stroke. Skips repeats so dragging within a single cell does
 * not spam the history with no-ops.
 */
function stroke(x, y) {
  if (x === lastCell.x && y === lastCell.y) return;
  lastCell = { x, y };

  const grid = currentGrid();
  const history = currentHistory();
  let changed = false;

  if (state.tool === 'pencil') {
    changed = pencil(grid, history, x, y, state.color);
    if (changed) { pushRecentColor(state.color); renderRecent(); }
  } else if (state.tool === 'eraser') {
    changed = eraser(grid, history, x, y);
  } else if (state.tool === 'fill') {
    changed = fill(grid, history, x, y, state.color);
    painting = false;               // fill is a single action, not a drag
    if (changed) { pushRecentColor(state.color); renderRecent(); }
    history.commit();
    if (changed) redraw();
    return;
  }
  if (changed) redrawFast();
}

/* ─────────────── topbar ─────────────── */

function bindTopbar() {
  document.querySelector('[data-action="home"]').addEventListener('click', () => go('landing'));

  document.getElementById('grid-size').addEventListener('change', e => {
    const next = Number(e.target.value);
    // Every frame resizes together — an animation cannot mix grid sizes.
    resizeAllFrames(state.frames, next);
    state.gridSize = next;
    redraw();
  });

  document.getElementById('btn-studio').addEventListener('click', () => go('studio'));
  const lines = document.getElementById('btn-grid-lines');
  lines.classList.toggle('is-on', state.showGridLines);
  lines.addEventListener('click', () => {
    state.showGridLines = !state.showGridLines;
    lines.classList.toggle('is-on', state.showGridLines);
    redraw({ timelineToo: false });
  });
}

/* ─────────────── history & colour controls ─────────────── */

function bindHistory() {
  document.getElementById('btn-undo').addEventListener('click', doUndo);
  document.getElementById('btn-redo').addEventListener('click', doRedo);

  document.getElementById('btn-clear').addEventListener('click', () => {
    const grid = currentGrid();
    const history = currentHistory();
    history.begin();
    for (let y = 0; y < state.gridSize; y++) {
      for (let x = 0; x < state.gridSize; x++) {
        if (grid[y][x] !== null) {
          history.record(x, y, grid[y][x], null);
          grid[y][x] = null;
        }
      }
    }
    history.commit();
    redraw();
  });
}

function doUndo() { if (currentHistory().undo(currentGrid())) redraw(); }
function doRedo() { if (currentHistory().redo(currentGrid())) redraw(); }

function bindColor() {
  document.getElementById('custom-color').addEventListener('input', e => setColor(e.target.value));
}

function bindKeyboard() {
  window.addEventListener('keydown', e => {
    if (state.view !== 'editor') return;
    if (e.target.matches('input, select, textarea')) return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
      return;
    }

    // frame navigation
    if (e.key === ',' || e.key === 'ArrowLeft')  { selectFrame(state.activeFrame - 1); return; }
    if (e.key === '.' || e.key === 'ArrowRight') { selectFrame(state.activeFrame + 1); return; }


    // onion skin toggle
    if (e.key.toLowerCase() === 'o') {
      state.onionEnabled = !state.onionEnabled;
      redraw({ timelineToo: false });
      return;
    }


    const map = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker' };
    const tool = map[e.key.toLowerCase()];
    if (tool) selectTool(tool);
  });
}