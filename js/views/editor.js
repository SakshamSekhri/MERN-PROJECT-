/**
 * Pixel editor view controller.
 *
 * Thin by design: it owns DOM wiring and pointer handling, and delegates all
 * real work to canvas/*, frames/* and image/*.
 */

import {
  state, PALETTE, pushRecentColor,
  currentFrame, currentGrid, currentHistory,
} from '../core/state.js';
import { countFilled, resampleGrid } from '../canvas/grid.js';
import { Renderer, drawThumbnail } from '../canvas/renderer.js';
import {
  resolveOnion, hasPreviousFrame, describeOnion, ONION_MAX_DEPTH,
} from '../canvas/onionSkin.js';
import {
  resolveReferenceUnderlay, referenceMatchesGrid, describeReference, updateReferenceGrid,
} from '../canvas/referenceLayer.js';
import { pencil, eraser, fill, pick, drawLine } from '../canvas/tools.js';
import {
  makeFrame, addFrame, deleteFrame, moveFrame, resizeAllFrames,
} from '../frames/frameManager.js';
import { Timeline } from '../frames/timeline.js';
import { imageToGrid } from '../image/pixelate.js';
import {
  compareGrids, formatScore, describeResult, DEFAULT_TOLERANCE,
} from '../compare/similarity.js';
import { go, onEnter } from '../core/router.js';
import { playForgeTransition } from './forgeLoader.js';

import { Journal } from '../core/journal.js';
import { History } from '../canvas/history.js';
import { openReplay } from './replayOverlay.js';

let renderer, refRenderer, timeline;
let painting = false;
let lastCell = { x: -1, y: -1 };

export function initEditor() {
  if (!state.frames || state.frames.length === 0) {
    state.frames = [makeFrame(state.gridSize)];
    state.activeFrame = 0;
  }

  const canvas = document.getElementById('paint-canvas');
  if (canvas) renderer = new Renderer(canvas);

  bindColor();
  bindFrames();
  bindOnion();
  bindReference();
  bindCompare();
  bindTools();
  if (canvas) bindPointer(canvas);
  bindKeyboard();
  bindTopbar();
  bindJournal();

  buildPalette();
  renderRecent();
  setColor(state.color);

  const timelineEl = document.getElementById('timeline');
  if (timelineEl) {
    timeline = new Timeline(timelineEl, {
      onSelect: selectFrame,
      onReorder: reorderFrame,
    });
  }

  onEnter('editor', () => {
    if (!state.frames || state.frames.length === 0) {
      state.frames = [makeFrame(state.gridSize)];
      state.activeFrame = 0;
    }
    redraw();
  });
}

/* ─────────────── rendering ─────────────── */

let isFastRedrawScheduled = false;

function scheduleFastRedraw() {
  if (isFastRedrawScheduled) return;
  isFastRedrawScheduled = true;
  requestAnimationFrame(() => {
    isFastRedrawScheduled = false;
    const grid = currentGrid();
    if (!grid || !renderer) return;
    renderer.draw(grid, {
      showGridLines: state.showGridLines,
      onion: activeOnion(),
      reference: activeReference(),
      errors: state.showErrors && state.comparison ? state.comparison.errors : null,
    });
  });
}

function redraw({ timelineToo = true } = {}) {
  if (!state.frames || state.frames.length === 0) {
    state.frames = [makeFrame(state.gridSize)];
    state.activeFrame = 0;
  }
  const grid = currentGrid();
  const history = currentHistory();
  if (!grid || !history || !renderer) return;

  const onion = resolveOnion(state.frames, state.activeFrame, {
    enabled: state.onionEnabled,
    opacity: state.onionOpacity,
    depth: state.onionDepth,
  });

  const reference = resolveReferenceUnderlay(state.reference, {
    enabled: state.refUnderlay,
    opacity: state.refOpacity,
    gridSize: state.gridSize,
  });

  const errors = state.showErrors && state.comparison
    ? state.comparison.errors
    : null;

  renderer.draw(grid, {
    showGridLines: state.showGridLines, onion, reference, errors,
  });
  updateOnionUI();
  updateReferenceUI();

  const filledEl = document.getElementById('stat-filled');
  if (filledEl) filledEl.textContent = countFilled(grid);
  const stepsEl = document.getElementById('stat-steps');
  if (stepsEl) stepsEl.textContent = history.steps;
  const statFrame = document.getElementById('stat-frame');
  if (statFrame) {
    statFrame.textContent = `${state.activeFrame + 1} / ${state.frames.length}`;
  }

  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) btnUndo.disabled = !history.canUndo;
  const btnRedo = document.getElementById('btn-redo');
  if (btnRedo) btnRedo.disabled = !history.canRedo;
  const btnDel = document.getElementById('btn-frame-delete');
  if (btnDel) btnDel.disabled = state.frames.length <= 1;
  const btnStudio = document.getElementById('btn-studio');
  if (btnStudio) btnStudio.disabled = false;

  if (timeline && timelineToo) {
    timeline.render(state.frames, state.activeFrame);
  } else {
    const activeThumb = document.querySelector(
      `#timeline .frame-item[data-index="${state.activeFrame}"] canvas`
    );
    if (activeThumb) drawThumbnail(activeThumb, grid);
  }

  renderReferencePanel();
}

function activeOnion() {
  return resolveOnion(state.frames, state.activeFrame, {
    enabled: state.onionEnabled,
    opacity: state.onionOpacity,
    depth: state.onionDepth,
  });
}

function activeReference() {
  return resolveReferenceUnderlay(state.reference, {
    enabled: state.refUnderlay,
    opacity: state.refOpacity,
    gridSize: state.gridSize,
  });
}

/* ─────────────── comparison panel ─────────────── */

function bindCompare() {
  const btnCompare = document.getElementById('btn-compare');
  if (btnCompare) {
    btnCompare.addEventListener('click', () => {
      if (!state.reference || !state.reference.grid) return;

      if (state.comparison) {
        state.comparison = null;
        state.showErrors = false;
      } else {
        state.comparison = compareGrids(currentGrid(), state.reference.grid, {
          tolerance: state.compareTolerance,
        });
        state.showErrors = true;
      }
      renderCompareResults();
      redraw();
    });
  }

  const btnClose = document.getElementById('btn-close-compare');
  if (btnClose) {
    btnClose.addEventListener('click', () => {
      state.comparison = null;
      state.showErrors = false;
      renderCompareResults();
      redraw();
    });
  }

  const tol = document.getElementById('tolerance');
  if (tol) {
    tol.addEventListener('input', e => {
      state.compareTolerance = e.target.value / 100;
      const tolReadout = document.getElementById('tolerance-readout');
      if (tolReadout) tolReadout.textContent = `${e.target.value}%`;
      if (state.comparison) {
        state.comparison = compareGrids(currentGrid(), state.reference.grid, {
          tolerance: state.compareTolerance,
        });
        renderCompareResults();
        redraw();
      }
    });
  }

  const btnShowErr = document.getElementById('btn-show-errors');
  if (btnShowErr) {
    btnShowErr.addEventListener('click', e => {
      state.showErrors = !state.showErrors;
      e.target.classList.toggle('is-on', state.showErrors);
      e.target.textContent = state.showErrors ? 'Hide mistakes' : 'Show mistakes';
      redraw();
    });
  }
}

function renderCompareResults() {
  const res = state.comparison;
  const panel = document.getElementById('score-panel');
  const btnCompare = document.getElementById('btn-compare');

  if (btnCompare) {
    btnCompare.classList.toggle('is-on', Boolean(res));
    btnCompare.textContent = res ? 'Cancel comparison' : 'Compare with reference';
  }

  if (!panel) return;
  if (!res) { panel.hidden = true; return; }

  panel.hidden = false;
  const overallEl = document.getElementById('score-overall');
  if (overallEl) overallEl.textContent = formatScore(res.overall);
  const placeEl = document.getElementById('score-placement');
  if (placeEl) placeEl.textContent = formatScore(res.placement);
  const colorEl = document.getElementById('score-color');
  if (colorEl) colorEl.textContent = formatScore(res.color);
  const verdictEl = document.getElementById('score-verdict');
  if (verdictEl) verdictEl.textContent = describeResult(res);

  const missingEl = document.getElementById('score-missing');
  if (missingEl) missingEl.textContent = res.counts.missing;
  const extraEl = document.getElementById('score-extra');
  if (extraEl) extraEl.textContent = res.counts.extra;
  const wrongEl = document.getElementById('score-wrong');
  if (wrongEl) wrongEl.textContent = res.counts.wrong;
}

/* ─────────────── frames timeline ─────────────── */

function bindFrames() {
  const btnEmpty = document.getElementById('btn-frame-empty');
  if (btnEmpty) {
    btnEmpty.addEventListener('click', () => {
      const next = addFrame(state.frames, state.activeFrame, state.gridSize, 'empty');
      selectFrame(next);
    });
  }

  const btnDupe = document.getElementById('btn-frame-dupe');
  if (btnDupe) {
    btnDupe.addEventListener('click', () => {
      const next = addFrame(state.frames, state.activeFrame, state.gridSize, 'duplicate');
      selectFrame(next);
    });
  }

  const btnDel = document.getElementById('btn-frame-delete');
  if (btnDel) {
    btnDel.addEventListener('click', () => {
      const next = deleteFrame(state.frames, state.activeFrame);
      if (next === null) return;
      state.activeFrame = next;
      redraw();
    });
  }

  const clearBtn = document.getElementById('btn-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearCanvas);
  }
}

function selectFrame(index) {
  if (index < 0 || index >= state.frames.length) return;
  state.activeFrame = index;
  redraw();
}

function reorderFrame(from, to) {
  const wasActive = state.frames[state.activeFrame];
  moveFrame(state.frames, from, to);
  state.activeFrame = state.frames.indexOf(wasActive);
  redraw();
}

function clearCanvas() {
  const grid = currentGrid();
  const history = currentHistory();
  if (!grid || !history) return;
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
}

/* ─────────────── onion skin ─────────────── */

function bindOnion() {
  const btnOnion = document.getElementById('btn-onion');
  if (btnOnion) {
    btnOnion.addEventListener('click', () => {
      state.onionEnabled = !state.onionEnabled;
      redraw({ timelineToo: false });
    });
  }

 const opacityEl = document.getElementById('onion-opacity');
  if (opacityEl) {
    opacityEl.addEventListener('input', e => {
      state.onionOpacity = e.target.value / 100;
      // image.html has the slider but no readout, so guard it — the outer
      // check only proves the slider exists.
      const readout = document.getElementById('onion-readout');
      if (readout) readout.textContent = `${e.target.value}%`;
      redraw({ timelineToo: false });
    });
  }

  document.querySelectorAll('.depth').forEach(b => {
    b.addEventListener('click', () => {
      state.onionDepth = Number(b.dataset.depth);
      redraw({ timelineToo: false });
    });
  });
}

function updateOnionUI() {
  const toggle = document.getElementById('btn-onion');
  if (toggle) toggle.classList.toggle('is-on', state.onionEnabled);
  const hint = document.getElementById('onion-hint');
  if (hint) hint.textContent = describeOnion(state.activeFrame, state.onionDepth, state.onionEnabled);

  const opacityEl = document.getElementById('onion-opacity');
  if (opacityEl) opacityEl.value = Math.round(state.onionOpacity * 100);
  const readoutEl = document.getElementById('onion-readout');
  if (readoutEl) readoutEl.textContent = `${Math.round(state.onionOpacity * 100)}%`;

  document.querySelectorAll('.depth').forEach(b => {
    b.classList.toggle('is-active', Number(b.dataset.depth) === state.onionDepth);
  });
}

/* ─────────────── reference panel ─────────────── */

function bindReference() {
  const toggle = document.getElementById('btn-ref-panel');
  if (toggle) {
    toggle.addEventListener('click', () => {
      state.refPanelOpen = !state.refPanelOpen;
      renderReferencePanel();
      updateReferenceUI();
    });
  }

  const under = document.getElementById('btn-ref-underlay');
  if (under) {
    under.addEventListener('click', () => {
      state.refUnderlay = !state.refUnderlay;
      updateReferenceUI();
      redraw({ timelineToo: false });
    });
  }

  const opacity = document.getElementById('ref-underlay-opacity');
  if (opacity) {
    opacity.addEventListener('input', e => {
      state.refOpacity = e.target.value / 100;
      updateReferenceUI();
      redraw({ timelineToo: false });
    });
  }

  const zoomIn = document.getElementById('ref-zoom-in');
  if (zoomIn) {
    zoomIn.addEventListener('click', () => {
      state.refZoom = Math.min(4, state.refZoom + 0.5);
      renderReferencePanel();
    });
  }

  const zoomOut = document.getElementById('ref-zoom-out');
  if (zoomOut) {
    zoomOut.addEventListener('click', () => {
      state.refZoom = Math.max(0.5, state.refZoom - 0.5);
      renderReferencePanel();
    });
  }

  const gridlines = document.getElementById('btn-ref-gridlines');
  if (gridlines) {
    gridlines.addEventListener('click', e => {
      state.refShowGrid = !state.refShowGrid;
      e.currentTarget.classList.toggle('is-on', state.refShowGrid);
      renderReferencePanel();
    });
  }

  const newImg = document.getElementById('btn-ref-new');
  if (newImg) newImg.addEventListener('click', () => go('reference'));
}

function renderReferencePanel() {
  const panel = document.getElementById('refpanel');
  if (!panel) return;

  const show = state.refPanelOpen && Boolean(state.reference?.grid);
  panel.hidden = !show;
  if (!show) return;

  const readout = document.getElementById('ref-zoom-readout');
  if (readout) readout.textContent = `${state.refZoom}x`;

  const canvas = document.getElementById('ref-canvas');
  if (!refRenderer || refRenderer.canvas !== canvas) {
    refRenderer = new Renderer(canvas);
  }
  refRenderer.draw(state.reference.grid, { showGridLines: state.refShowGrid });

  canvas.style.width = `${240 * state.refZoom}px`;
  canvas.style.height = `${240 * state.refZoom}px`;
}

function updateReferenceUI() {
  const has = Boolean(state.reference?.grid);
  const matches = referenceMatchesGrid(state.reference, state.gridSize);

  const controls = document.getElementById('ref-controls');
  if (controls) controls.hidden = !has;
  const btnCompare = document.getElementById('btn-compare');
  if (btnCompare) {
    btnCompare.disabled = !matches;
    btnCompare.classList.toggle('is-on', matches && Boolean(state.comparison));
    btnCompare.textContent = state.comparison ? 'Cancel comparison' : 'Compare with reference';
  }
  if (!has) return;

  const toggle = document.getElementById('btn-ref-panel');
  if (toggle) {
    toggle.classList.toggle('is-on', state.refPanelOpen);
    toggle.textContent = state.refPanelOpen ? 'Hide reference' : 'Show reference';
  }

  const under = document.getElementById('btn-ref-underlay');
  if (under) {
    under.disabled = !matches;
    under.classList.toggle('is-on', matches && state.refUnderlay);
  }

  const slider = document.getElementById('ref-underlay-opacity');
  if (slider) {
    slider.disabled = !matches || !state.refUnderlay;
    slider.value = Math.round(state.refOpacity * 100);
  }
  const readout = document.getElementById('ref-underlay-readout');
  if (readout) readout.textContent = `${Math.round(state.refOpacity * 100)}%`;

  const hint = document.getElementById('ref-panel-hint');
  if (hint) {
    hint.textContent = describeReference(state.reference, state.gridSize);
    hint.classList.toggle('is-warn', has && !matches);
  }
}

/* ─────────────── palette ─────────────── */

function buildPalette() {
  const wrap = document.getElementById('palette');
  if (!wrap) return;
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
  if (!wrap) return;
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
  const chip = document.getElementById('active-chip');
  if (chip) chip.style.background = hex;
  const hexEl = document.getElementById('active-hex');
  if (hexEl) hexEl.textContent = hex.toUpperCase();
  const custom = document.getElementById('custom-color');
  if (custom) custom.value = hex;

  document.querySelectorAll('#palette .swatch').forEach(s => {
    s.classList.toggle('is-active', rgbToHex(s.style.background) === hex.toLowerCase());
  });
}

function rgbToHex(rgb) {
  if (!rgb) return '';
  if (rgb.startsWith('#')) return rgb.toLowerCase();
  const m = rgb.match(/\d+/g);
  if (!m || m.length < 3) return '';
  const r = Number(m[0]).toString(16).padStart(2, '0');
  const g = Number(m[1]).toString(16).padStart(2, '0');
  const b = Number(m[2]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
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

function doPick(e) {
  const paintCanvas = document.getElementById('paint-canvas');
  const refCanvas = document.getElementById('ref-canvas');

  if (paintCanvas && renderer) {
    const rect = paintCanvas.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      const { x, y } = renderer.toCell(e, state.gridSize);
      let c = pick(currentGrid(), x, y);
      if (!c && state.reference && state.reference.grid) {
        const refGrid = state.reference.grid;
        if (y >= 0 && y < refGrid.length && x >= 0 && x < refGrid.length) {
          c = refGrid[y][x];
        }
      }
      if (c) {
        setColor(c);
        pushRecentColor(c);
        renderRecent();
        return;
      }
    }
  }

  if (refCanvas && state.reference && state.reference.grid) {
    const rect = refCanvas.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      const refGrid = state.reference.grid;
      const { x, y } = refRenderer
        ? refRenderer.toCell(e, refGrid.length)
        : renderer.toCell(e, refGrid.length);
      if (y >= 0 && y < refGrid.length && x >= 0 && x < refGrid.length) {
        const c = refGrid[y][x];
        if (c) {
          setColor(c);
          pushRecentColor(c);
          renderRecent();
          return;
        }
      }
    }
  }
}

/* ─────────────── pointer ─────────────── */

let picking = false;

function bindPointer(canvas) {
  window.addEventListener('pointerdown', e => {
    if (state.tool === 'picker') {
      picking = true;
      doPick(e);
    }
  });

  window.addEventListener('pointermove', e => {
    if (state.tool === 'picker' && (picking || e.buttons > 0)) {
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events) {
        doPick(ev);
      }
    }
  });

  const stopPick = () => {
    picking = false;
  };
  window.addEventListener('pointerup', stopPick);
  window.addEventListener('pointercancel', stopPick);

  canvas.addEventListener('pointerdown', e => {
    if (state.tool === 'picker') return;

    canvas.setPointerCapture(e.pointerId);
    const { x, y } = renderer.toCell(e, state.gridSize);

    painting = true;
    const history = currentHistory();
    if (history) history.begin();
    lastCell = { x: -1, y: -1 };
    if (stroke(x, y)) scheduleFastRedraw();
  });

  canvas.addEventListener('pointermove', e => {
    const { x, y } = renderer.toCell(e, state.gridSize);
    const statCell = document.getElementById('stat-cell');
    if (statCell) {
      statCell.textContent =
        x >= 0 && y >= 0 && x < state.gridSize && y < state.gridSize ? `${x}, ${y}` : '—';
    }

    if (painting && state.tool !== 'picker') {
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      let anyChanged = false;
      for (const ev of events) {
        const cell = renderer.toCell(ev, state.gridSize);
        if (stroke(cell.x, cell.y)) anyChanged = true;
      }
      if (anyChanged) scheduleFastRedraw();
    }
  });

  const end = () => {
    if (!painting) return;
    painting = false;
    lastCell = { x: -1, y: -1 };
    const history = currentHistory();
    if (history && history.commit()) redraw();
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    const statCell = document.getElementById('stat-cell');
    if (statCell) statCell.textContent = '—';
  });
}

function stroke(x, y) {
  if (x === lastCell.x && y === lastCell.y) return false;
  if (x < 0 || y < 0 || x >= state.gridSize || y >= state.gridSize) return false;

  const grid = currentGrid();
  const history = currentHistory();
  if (!grid || !history) return false;
  let changed = false;

  const startX = (lastCell.x >= 0) ? lastCell.x : x;
  const startY = (lastCell.y >= 0) ? lastCell.y : y;
  lastCell = { x, y };

  if (state.tool === 'pencil') {
    changed = drawLine(grid, history, startX, startY, x, y, (g, h, cx, cy) => pencil(g, h, cx, cy, state.color));
    if (changed) { pushRecentColor(state.color); renderRecent(); }
  } else if (state.tool === 'eraser') {
    changed = drawLine(grid, history, startX, startY, x, y, (g, h, cx, cy) => eraser(g, h, cx, cy));
  } else if (state.tool === 'fill') {
    changed = fill(grid, history, x, y, state.color);
    painting = false;
    if (changed) { pushRecentColor(state.color); renderRecent(); }
    history.commit();
    if (changed) redraw();
    return true;
  }
  return changed;
}

/* ─────────────── topbar ─────────────── */

function bindTopbar() {
  const homeBtn = document.querySelector('[data-action="home"]');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }

  const sizeSelect = document.getElementById('grid-size');
  if (sizeSelect) {
    sizeSelect.addEventListener('change', e => {
      const next = Number(e.target.value);
      resizeAllFrames(state.frames, next);
      state.gridSize = next;
      if (state.reference) {
        state.reference = updateReferenceGrid(state.reference, next);
        const refSizeSelect = document.getElementById('ref-size');
        if (refSizeSelect) refSizeSelect.value = String(next);
        if (state.comparison) {
          state.comparison = compareGrids(currentGrid(), state.reference.grid, {
            tolerance: state.compareTolerance,
          });
          renderCompareResults();
        }
      }
      redraw();
    });
  }

  const btnStudio = document.getElementById('btn-studio');
  if (btnStudio) {
    btnStudio.addEventListener('click', () => {
      playForgeTransition(() => go('studio'));
    });
  }

  const lines = document.getElementById('btn-grid-lines');
  if (lines) {
    lines.classList.toggle('is-on', state.showGridLines);
    lines.addEventListener('click', () => {
      state.showGridLines = !state.showGridLines;
      lines.classList.toggle('is-on', state.showGridLines);
      redraw({ timelineToo: false });
    });
  }
}

function doUndo() {
  const history = currentHistory();
  if (!history) return;
  if (history.undo(currentGrid())) redraw();
}

function doRedo() {
  const history = currentHistory();
  if (!history) return;
  if (history.redo(currentGrid())) redraw();
}

function bindColor() {
  const custom = document.getElementById('custom-color');
  if (custom) custom.addEventListener('input', e => setColor(e.target.value));
}

function bindKeyboard() {
  window.addEventListener('keydown', e => {
    if (state.view !== 'editor') return;
    if (e.target.matches('input, select, textarea')) return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod) {
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        e.shiftKey ? doRedo() : doUndo();
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        doRedo();
        return;
      }
    }

    if (e.key === ',' || e.key === 'ArrowLeft')  { selectFrame(state.activeFrame - 1); return; }
    if (e.key === '.' || e.key === 'ArrowRight') { selectFrame(state.activeFrame + 1); return; }

    const map = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker' };
    const tool = map[e.key.toLowerCase()];
    if (tool) selectTool(tool);
  });
}


/* ─────────────── delta journal & replay ─────────────── */

/**
 * The append-only record of every committed change.
 *
 * Separate from the undo stack on purpose: history.js POPS on undo, so it
 * cannot answer "what actually happened" — only "what can I still reverse".
 * Replay needs the former, including work the artist later undid.
 */
export const journal = new Journal();

function bindJournal() {
  // One assignment wires every History instance, present and future. See the
  // note in history.js commit() for why the hook is static.
  History.onAnyCommit = step => {
    const frame = state.frames?.[state.activeFrame];
    journal.push(step, frame?.id ?? 0);
    updateReplayButton();
  };

  const btn = document.getElementById('btn-replay');
  if (btn) {
    btn.addEventListener('click', () => {
      openReplay({ journal, size: state.gridSize });
    });
  }
  updateReplayButton();
}

function updateReplayButton() {
  const btn = document.getElementById('btn-replay');
  if (!btn) return;
  btn.disabled = journal.isEmpty;
  const count = document.getElementById('replay-count');
  if (count) count.textContent = journal.length;
}