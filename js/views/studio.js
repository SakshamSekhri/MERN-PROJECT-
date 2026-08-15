/**
 * Animation Studio view controller.
 *
 * The editor is for creating; the studio is for arranging and previewing.
 * They share the same frame array in state, so a change in one is instantly
 * visible in the other — no import/export step between them.
 *
 * The timeline here is the same Timeline class the editor uses. It takes an
 * array and callbacks, so mounting it on a second element with different
 * handlers is all that reuse requires.
 */

import { state } from '../core/state.js';
import { Renderer } from '../canvas/renderer.js';
import { Timeline } from '../frames/timeline.js';
import { addFrame, deleteFrame, moveFrame } from '../frames/frameManager.js';
import { Player } from '../animation/player.js';
import { computeStats, formatDuration } from '../animation/stats.js';
import { go, onEnter } from '../core/router.js';

const FPS_OPTIONS = [8, 12, 16, 24, 30];

let renderer, timeline, player;

export function initStudio() {
  renderer = new Renderer(document.getElementById('studio-canvas'));

  timeline = new Timeline(document.getElementById('studio-timeline'), {
    onSelect: index => { player.goTo(index); },
    onReorder: reorderFrame,
  });

  player = new Player(
    () => state.frames,
    index => {
      // Called on every frame change, including 30 times a second during
      // playback. Repaint the preview only; rebuilding the timeline here
      // would thrash the DOM.
      drawPreview(index);
      highlightActive(index);
    }
  );
  player.onStop = () => updateTransport();

  buildFpsButtons();
  bindTransport();

  // Re-sync whenever the view opens — frames may have changed in the editor.
  onEnter('studio', refresh);
}

/* ─────────────── rendering ─────────────── */

/** Full refresh: preview, timeline, transport, stats. */
function refresh() {
  player.pause();
  player.setFps(state.fps);
  player.setLoop(state.loop);

  // The editor may have deleted frames while the studio was closed.
  if (player.index >= state.frames.length) player.index = 0;

  drawPreview(player.index);
  timeline.render(state.frames, player.index);
  updateTransport();
  updateStats();
}

function drawPreview(index) {
  const frame = state.frames[index];
  if (!frame) return;
  // No grid lines in the preview — this is the finished artwork, not a
  // working surface.
  renderer.draw(frame.grid, { showGridLines: false });
  document.getElementById('studio-frame-no').textContent =
    `${index + 1} / ${state.frames.length}`;
}

/**
 * Move the active highlight without re-rendering the timeline.
 *
 * At 30 FPS a full re-render would rebuild every thumbnail thirty times a
 * second and cancel any drag in progress. Toggling a class is enough.
 */
function highlightActive(index) {
  document.querySelectorAll('#studio-timeline .frame-item').forEach(el => {
    el.classList.toggle('is-active', Number(el.dataset.index) === index);
  });
}

/* ─────────────── transport ─────────────── */

function bindTransport() {
  document.getElementById('btn-play').addEventListener('click', () => {
    player.toggle();
    updateTransport();
  });

  document.getElementById('btn-prev').addEventListener('click', () => {
    player.step(-1);
    updateTransport();
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    player.step(1);
    updateTransport();
  });

  document.getElementById('btn-loop').addEventListener('click', () => {
    state.loop = !state.loop;
    player.setLoop(state.loop);
    updateTransport();
  });

  document.getElementById('btn-studio-back').addEventListener('click', () => {
    player.pause();          // never leave a loop running behind a hidden view
    go('editor');
  });

  // frame operations
  document.getElementById('btn-studio-dupe').addEventListener('click', () => {
    const next = addFrame(state.frames, player.index, state.gridSize, 'duplicate');
    player.goTo(next);
    refreshAfterEdit();
  });

  document.getElementById('btn-studio-delete').addEventListener('click', () => {
    const next = deleteFrame(state.frames, player.index);
    if (next === null) return;
    player.goTo(next);
    refreshAfterEdit();
  });

  window.addEventListener('keydown', e => {
    if (state.view !== 'studio') return;
    if (e.target.matches('input, select, textarea')) return;

    if (e.code === 'Space') { e.preventDefault(); player.toggle(); updateTransport(); return; }
    if (e.key === 'ArrowLeft')  { player.step(-1); updateTransport(); return; }
    if (e.key === 'ArrowRight') { player.step(1);  updateTransport(); return; }
  });
}

function refreshAfterEdit() {
  timeline.render(state.frames, player.index);
  drawPreview(player.index);
  updateTransport();
  updateStats();
}

function updateTransport() {
  const play = document.getElementById('btn-play');
  play.textContent = player.playing ? '❚❚  Pause' : '▶  Play';
  play.classList.toggle('is-playing', player.playing);
  play.disabled = state.frames.length < 2;
  play.title = state.frames.length < 2
    ? 'Add a second frame to play — try Duplicate'
    : '';
  const loop = document.getElementById('btn-loop');
  loop.classList.toggle('is-on', state.loop);
  loop.textContent = state.loop ? '🔁  Loop on' : '➡  Play once';

  document.getElementById('btn-studio-delete').disabled = state.frames.length <= 1;
}

/* ─────────────── fps ─────────────── */

function buildFpsButtons() {
  const wrap = document.getElementById('fps-options');
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
  document.getElementById('stat-count').textContent = s.count;
  document.getElementById('stat-size').textContent = `${s.gridSize} × ${s.gridSize}`;
  document.getElementById('stat-fps').textContent = s.fps;
  document.getElementById('stat-duration').textContent = formatDuration(s.durationMs);
  document.getElementById('stat-blank').textContent = s.blank;
}