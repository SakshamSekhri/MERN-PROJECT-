/**
 * Animation Studio view controller.
 *
 * Supports timeline sequence arrangement, playback transport, direct
 * interactive editing on the studio preview canvas, and full toolbar & palette controls.
 */

import { state, PALETTE, pushRecentColor } from '../core/state.js';
import { Renderer, drawThumbnail } from '../canvas/renderer.js';
import { Timeline } from '../frames/timeline.js';
import { addFrame, deleteFrame, moveFrame } from '../frames/frameManager.js';
import { Player } from '../animation/player.js';
import { computeStats, formatDuration } from '../animation/stats.js';
import { pencil, eraser, fill, pick, drawLine } from '../canvas/tools.js';
import { go, onEnter } from '../core/router.js';

const FPS_OPTIONS = [8, 12, 16, 24, 30];

let renderer, timeline, player;
let painting = false;
let lastCell = { x: -1, y: -1 };

export function initStudio() {
  const canvas = document.getElementById('studio-canvas');
  if (!canvas) return;
  renderer = new Renderer(canvas);

  const timelineEl = document.getElementById('studio-timeline');
  if (timelineEl) {
    timeline = new Timeline(timelineEl, {
      onSelect: index => { player.goTo(index); },
      onReorder: reorderFrame,
    });
  }

  player = new Player(
    () => state.frames,
    index => {
      drawPreview(index);
      highlightActive(index);
    }
  );
  player.onStop = () => updateTransport();

  buildFpsButtons();
  bindTransport();
  bindStudioPointer();
  bindStudioToolbar();
  buildStudioPalette();
  setStudioColor(state.color);

  onEnter('studio', refresh);
}

/* ─────────────── studio toolbar & palette ─────────────── */

function bindStudioToolbar() {
  document.querySelectorAll('#studio-toolset .tool').forEach(btn => {
    btn.addEventListener('click', () => {
      selectStudioTool(btn.dataset.tool);
    });
  });

  const custom = document.getElementById('studio-custom-color');
  if (custom) {
    custom.addEventListener('input', e => setStudioColor(e.target.value));
  }

  const btnUndo = document.getElementById('btn-studio-undo');
  if (btnUndo) {
    btnUndo.addEventListener('click', () => {
      const frame = state.frames[player.index];
      if (frame && frame.history.undo(frame.grid)) {
        refreshAfterEdit();
      }
    });
  }

  const btnRedo = document.getElementById('btn-studio-redo');
  if (btnRedo) {
    btnRedo.addEventListener('click', () => {
      const frame = state.frames[player.index];
      if (frame && frame.history.redo(frame.grid)) {
        refreshAfterEdit();
      }
    });
  }

  const btnClear = document.getElementById('btn-studio-clear');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      const frame = state.frames[player.index];
      if (!frame) return;
      const history = frame.history;
      history.begin();
      for (let y = 0; y < state.gridSize; y++) {
        for (let x = 0; x < state.gridSize; x++) {
          if (frame.grid[y][x] !== null) {
            history.record(x, y, frame.grid[y][x], null);
            frame.grid[y][x] = null;
          }
        }
      }
      history.commit();
      refreshAfterEdit();
    });
  }
}

function selectStudioTool(tool) {
  state.tool = tool;
  document.querySelectorAll('.tool').forEach(b => {
    b.classList.toggle('is-active', b.dataset.tool === tool);
  });
}

function buildStudioPalette() {
  const wrap = document.getElementById('studio-palette');
  if (!wrap) return;
  wrap.innerHTML = '';
  PALETTE.forEach(hex => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.background = hex;
    b.title = hex;
    b.addEventListener('click', () => setStudioColor(hex));
    wrap.appendChild(b);
  });
}

function setStudioColor(hex) {
  state.color = hex;
  const chip = document.getElementById('studio-active-chip');
  if (chip) chip.style.background = hex;
  const hexEl = document.getElementById('studio-active-hex');
  if (hexEl) hexEl.textContent = hex.toUpperCase();
  const custom = document.getElementById('studio-custom-color');
  if (custom) custom.value = hex;

  const mainChip = document.getElementById('active-chip');
  if (mainChip) mainChip.style.background = hex;
  const mainHex = document.getElementById('active-hex');
  if (mainHex) mainHex.textContent = hex.toUpperCase();
  const mainCustom = document.getElementById('custom-color');
  if (mainCustom) mainCustom.value = hex;

  document.querySelectorAll('.palette .swatch').forEach(s => {
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

/* ─────────────── interactive direct editing ─────────────── */

function bindStudioPointer() {
  const canvas = document.getElementById('studio-canvas');
  if (!canvas) return;

  canvas.style.cursor = 'crosshair';

  canvas.addEventListener('pointerdown', e => {
    if (player.playing) {
      player.pause();
      updateTransport();
    }

    const frame = state.frames[player.index];
    if (!frame) return;

    const { x, y } = renderer.toCell(e, state.gridSize);

    if (state.tool === 'picker') {
      const c = pick(frame.grid, x, y);
      if (c) {
        setStudioColor(c);
        pushRecentColor(c);
      }
      return;
    }

    canvas.setPointerCapture(e.pointerId);
    painting = true;
    frame.history.begin();
    lastCell = { x: -1, y: -1 };
    strokeStudio(frame, x, y);
  });

  canvas.addEventListener('pointermove', e => {
    if (!painting) return;
    const frame = state.frames[player.index];
    if (!frame) return;

    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      const { x, y } = renderer.toCell(ev, state.gridSize);
      strokeStudio(frame, x, y);
    }
  });

  const end = () => {
    if (!painting) return;
    painting = false;
    lastCell = { x: -1, y: -1 };
    const frame = state.frames[player.index];
    if (frame && frame.history.commit()) {
      refreshAfterEdit();
    }
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function strokeStudio(frame, x, y) {
  if (x === lastCell.x && y === lastCell.y) return;

  const grid = frame.grid;
  const history = frame.history;
  let changed = false;

  const startX = (lastCell.x >= 0) ? lastCell.x : x;
  const startY = (lastCell.y >= 0) ? lastCell.y : y;
  lastCell = { x, y };

  if (state.tool === 'pencil') {
    changed = drawLine(grid, history, startX, startY, x, y, (g, h, cx, cy) => pencil(g, h, cx, cy, state.color));
    if (changed) pushRecentColor(state.color);
  } else if (state.tool === 'eraser') {
    changed = drawLine(grid, history, startX, startY, x, y, (g, h, cx, cy) => eraser(g, h, cx, cy));
  } else if (state.tool === 'fill') {
    changed = fill(grid, history, x, y, state.color);
    painting = false;
    if (changed) pushRecentColor(state.color);
    history.commit();
    refreshAfterEdit();
    return;
  }

  if (changed) {
    drawPreview(player.index);
    const thumb = document.querySelector(
      `#studio-timeline .frame-item[data-index="${player.index}"] canvas`
    );
    if (thumb) drawThumbnail(thumb, grid);
    updateStats();
  }
}

/* ─────────────── rendering ─────────────── */

/** Full refresh: preview, timeline, transport, stats. */
function refresh() {
  player.pause();
  player.setFps(state.fps);
  player.setLoop(state.loop);

  if (player.index >= state.frames.length) player.index = 0;

  drawPreview(player.index);
  timeline.render(state.frames, player.index);
  updateTransport();
  updateStats();
  setStudioColor(state.color);
  selectStudioTool(state.tool);
}

function drawPreview(index) {
  const frame = state.frames[index];
  if (!frame || !renderer) return;
  renderer.draw(frame.grid, { showGridLines: state.showGridLines });
  const frameNo = document.getElementById('studio-frame-no');
  if (frameNo) {
    frameNo.textContent = `${index + 1} / ${state.frames.length}`;
  }
}

function highlightActive(index) {
  document.querySelectorAll('#studio-timeline .frame-item').forEach(el => {
    el.classList.toggle('is-active', Number(el.dataset.index) === index);
  });
}

/* ─────────────── transport & keyboard ─────────────── */

function bindTransport() {
  const playBtn = document.getElementById('btn-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      player.toggle();
      updateTransport();
    });
  }

  const prevBtn = document.getElementById('btn-prev');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      player.step(-1);
      updateTransport();
    });
  }

  const nextBtn = document.getElementById('btn-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      player.step(1);
      updateTransport();
    });
  }

  const loopBtn = document.getElementById('btn-loop');
  if (loopBtn) {
    loopBtn.addEventListener('click', () => {
      state.loop = !state.loop;
      player.setLoop(state.loop);
      updateTransport();
    });
  }

  const backBtn = document.getElementById('btn-studio-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      player.pause();
      go('editor');
    });
  }

  const dupeBtn = document.getElementById('btn-studio-dupe');
  if (dupeBtn) {
    dupeBtn.addEventListener('click', () => {
      const next = addFrame(state.frames, player.index, state.gridSize, 'duplicate');
      player.goTo(next);
      refreshAfterEdit();
    });
  }

  const delBtn = document.getElementById('btn-studio-delete');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      const next = deleteFrame(state.frames, player.index);
      if (next === null) return;
      player.goTo(next);
      refreshAfterEdit();
    });
  }

  window.addEventListener('keydown', e => {
    if (state.view !== 'studio') return;
    if (e.target.matches('input, select, textarea')) return;

    const mod = e.metaKey || e.ctrlKey;
    if (mod) {
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        const frame = state.frames[player.index];
        if (frame) {
          const changed = e.shiftKey ? frame.history.redo(frame.grid) : frame.history.undo(frame.grid);
          if (changed) refreshAfterEdit();
        }
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        const frame = state.frames[player.index];
        if (frame) {
          const changed = frame.history.redo(frame.grid);
          if (changed) refreshAfterEdit();
        }
        return;
      }
    }

    if (e.code === 'Space') { e.preventDefault(); player.toggle(); updateTransport(); return; }
    if (e.key === 'ArrowLeft')  { player.step(-1); updateTransport(); return; }
    if (e.key === 'ArrowRight') { player.step(1);  updateTransport(); return; }

    const map = { b: 'pencil', e: 'eraser', g: 'fill', i: 'picker' };
    const tool = map[e.key.toLowerCase()];
    if (tool) {
      selectStudioTool(tool);
    }
  });
}

function refreshAfterEdit() {
  if (timeline) timeline.render(state.frames, player.index);
  drawPreview(player.index);
  updateTransport();
  updateStats();
  const btnUndo = document.getElementById('btn-studio-undo');
  const frame = state.frames[player.index];
  if (btnUndo && frame) btnUndo.disabled = !frame.history.canUndo;
  const btnRedo = document.getElementById('btn-studio-redo');
  if (btnRedo && frame) btnRedo.disabled = !frame.history.canRedo;
}

function updateTransport() {
  const play = document.getElementById('btn-play');
  if (play) {
    play.textContent = player.playing ? '❚❚  Pause' : '▶  Play';
    play.classList.toggle('is-playing', player.playing);
    play.disabled = state.frames.length < 2;
    play.title = state.frames.length < 2
      ? 'Add a second frame to play — try Duplicate'
      : '';
  }
  const loop = document.getElementById('btn-loop');
  if (loop) {
    loop.classList.toggle('is-on', state.loop);
    loop.textContent = state.loop ? '🔁  Loop on' : '➡  Play once';
  }

  const btnDel = document.getElementById('btn-studio-delete');
  if (btnDel) btnDel.disabled = state.frames.length <= 1;

  const btnUndo = document.getElementById('btn-studio-undo');
  const frame = state.frames[player.index];
  if (btnUndo && frame) btnUndo.disabled = !frame.history.canUndo;
  const btnRedo = document.getElementById('btn-studio-redo');
  if (btnRedo && frame) btnRedo.disabled = !frame.history.canRedo;
}

/* ─────────────── fps ─────────────── */

function buildFpsButtons() {
  const wrap = document.getElementById('fps-options');
  if (!wrap) return;
  wrap.innerHTML = '';
  FPS_OPTIONS.forEach(fps => {
    const b = document.createElement('button');
    b.className = 'fps' + (fps === state.fps ? ' is-active' : '');
    b.textContent = fps;
    b.addEventListener('click', () => {
      state.fps = fps;
      player.setFps(fps);
      wrap.querySelectorAll('.fps').forEach(x => x.classList.toggle('is-active', x === b));
      updateStats();
    });
    wrap.appendChild(b);
  });
}

/* ─────────────── frames & stats ─────────────── */

function reorderFrame(from, to) {
  const wasActive = state.frames[player.index];
  moveFrame(state.frames, from, to);
  player.index = state.frames.indexOf(wasActive);
  refreshAfterEdit();
}

function updateStats() {
  const s = computeStats(state.frames, state.fps);
  const countEl = document.getElementById('stat-count');
  if (countEl) countEl.textContent = s.count;
  const sizeEl = document.getElementById('stat-size');
  if (sizeEl) sizeEl.textContent = `${s.gridSize} × ${s.gridSize}`;
  const fpsEl = document.getElementById('stat-fps');
  if (fpsEl) fpsEl.textContent = s.fps;
  const durEl = document.getElementById('stat-duration');
  if (durEl) durEl.textContent = formatDuration(s.durationMs);
  const blankEl = document.getElementById('stat-blank');
  if (blankEl) blankEl.textContent = s.blank;
}