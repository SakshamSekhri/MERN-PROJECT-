/**
 * Replay overlay.
 *
 * A full-screen player that rebuilds the artwork from the delta journal —
 * play, pause, scrub, speed. The canvas it draws is never a stored snapshot:
 * every frame shown is computed by applying deltas 0..n to an empty grid.
 *
 * Built lazily on first open and reused after, so a project that never opens
 * replay pays nothing for it.
 */

import { Renderer } from '../canvas/renderer.js';
import { gridAt, scheduleFor, summarise } from '../replay/replay.js';

const SPEEDS = [0.5, 1, 2, 4];

let el = null;          // overlay root
let renderer = null;
let entries = [];
let gridSize = 32;

let cursor = { grid: null, count: 0 };   // forward-seek cache
let position = 0;
let playing = false;
let rafId = null;
let lastTime = 0;
let accumulator = 0;
let speed = 1;
let mode = 'even';

/* ─────────────── public ─────────────── */

export function openReplay({ journal, size }) {
  entries = journal?.entries ?? [];
  gridSize = size;

  if (!el) build();

  el.hidden = false;
  document.body.classList.add('is-replaying');

  reset();
  updateMeta();

  // Nothing to replay is a real state, not an error — say so plainly.
  const empty = entries.length === 0;
  el.querySelector('.replay__empty').hidden = !empty;
  el.querySelector('.replay__player').hidden = empty;

  if (!empty) play();
}

export function closeReplay() {
  pause();
  if (el) el.hidden = true;
  document.body.classList.remove('is-replaying');
}

/* ─────────────── construction ─────────────── */

function build() {
  el = document.createElement('div');
  el.className = 'replay';
  el.innerHTML = `
    <div class="replay__sheet">
      <header class="replay__head">
        <span class="replay__title">Replay</span>
        <span class="replay__sub" id="replay-meta"></span>
        <button class="replay__close" id="replay-close" title="Close (Esc)">×</button>
      </header>

      <p class="replay__empty" hidden>
        Nothing recorded yet — draw something first, then replay it.
      </p>

      <div class="replay__player">
        <div class="replay__stage">
          <canvas id="replay-canvas" width="512" height="512"></canvas>
        </div>

        <div class="replay__readout">
          <span><em>delta</em><b id="replay-pos">0</b></span>
          <span><em>of</em><b id="replay-total">0</b></span>
          <span><em>cell</em><b id="replay-cell">—</b></span>
        </div>

        <input type="range" id="replay-scrub" class="replay__scrub" min="0" max="0" value="0" />

        <div class="replay__controls">
          <button class="btn" id="replay-restart" title="Restart">⏮</button>
          <button class="btn btn--play" id="replay-play">▶  Play</button>
          <div class="replay__speeds" id="replay-speeds"></div>
          <button class="btn btn--ghost" id="replay-mode" title="Even pacing, or the real recorded timing">Even pacing</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  renderer = new Renderer(el.querySelector('#replay-canvas'));

  el.querySelector('#replay-close').addEventListener('click', closeReplay);
  el.addEventListener('click', e => { if (e.target === el) closeReplay(); });

  el.querySelector('#replay-play').addEventListener('click', () => {
    playing ? pause() : play();
  });

  el.querySelector('#replay-restart').addEventListener('click', () => {
    pause();
    reset();
    play();
  });

  el.querySelector('#replay-scrub').addEventListener('input', e => {
    pause();
    seek(Number(e.target.value));
  });

  el.querySelector('#replay-mode').addEventListener('click', e => {
    mode = mode === 'even' ? 'realtime' : 'even';
    e.currentTarget.textContent = mode === 'even' ? 'Even pacing' : 'Real timing';
    e.currentTarget.classList.toggle('is-on', mode === 'realtime');
  });

  const speedsEl = el.querySelector('#replay-speeds');
  SPEEDS.forEach(s => {
    const b = document.createElement('button');
    b.className = 'replay__speed' + (s === 1 ? ' is-active' : '');
    b.textContent = `${s}x`;
    b.addEventListener('click', () => {
      speed = s;
      speedsEl.querySelectorAll('.replay__speed')
        .forEach(x => x.classList.toggle('is-active', x === b));
    });
    speedsEl.appendChild(b);
  });

  window.addEventListener('keydown', e => {
    if (!el || el.hidden) return;
    if (e.key === 'Escape') { closeReplay(); return; }
    if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
  });
}

/* ─────────────── playback ─────────────── */

function reset() {
  position = 0;
  cursor = { grid: null, count: 0 };
  const scrub = el.querySelector('#replay-scrub');
  scrub.max = String(entries.length);
  scrub.value = '0';
  draw();
}

function seek(n) {
  position = Math.max(0, Math.min(n, entries.length));
  draw();
}

function play() {
  if (playing || entries.length === 0) return;
  // Playing from the end should replay, not sit on the final frame.
  if (position >= entries.length) { position = 0; cursor = { grid: null, count: 0 }; }
  playing = true;
  lastTime = performance.now();
  accumulator = 0;
  updatePlayButton();
  rafId = requestAnimationFrame(tick);
}

function pause() {
  playing = false;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  updatePlayButton();
}

/**
 * rAF with an accumulator, same reasoning as the animation player:
 * setInterval drifts on non-integer intervals and background tabs throttle
 * it, then fire a burst of queued callbacks on return.
 */
function tick(now) {
  if (!playing) return;

  accumulator += now - lastTime;
  lastTime = now;

  let advanced = false;
  let guard = 0;

  // Drain in a while loop so a stalled tab catches up rather than running
  // slow. The guard stops a very small interval from locking the frame.
  while (position < entries.length && guard < 400) {
    const wait = scheduleFor(entries, position, { mode, speed });
    if (accumulator < wait) break;
    accumulator -= wait;
    position++;
    advanced = true;
    guard++;
  }

  if (advanced) draw();

  if (position >= entries.length) { pause(); return; }
  rafId = requestAnimationFrame(tick);
}

/* ─────────────── rendering ─────────────── */

function draw() {
  // The grid is DERIVED here, never stored. The cursor lets forward playback
  // apply only the new deltas instead of rebuilding from empty each frame.
  cursor = gridAt(entries, position, gridSize, cursor);
  renderer.draw(cursor.grid, { showGridLines: false });

  el.querySelector('#replay-pos').textContent = position;
  el.querySelector('#replay-total').textContent = entries.length;
  el.querySelector('#replay-scrub').value = String(position);

  const e = entries[position - 1];
  el.querySelector('#replay-cell').textContent = e ? `${e.x}, ${e.y}` : '—';
}

function updatePlayButton() {
  const b = el.querySelector('#replay-play');
  b.textContent = playing ? '❚❚  Pause' : '▶  Play';
  b.classList.toggle('is-playing', playing);
}

function updateMeta() {
  const s = summarise(entries);
  el.querySelector('#replay-meta').textContent =
    `${s.total} deltas · ${s.frames} frame${s.frames === 1 ? '' : 's'} · ${gridSize}×${gridSize}`;
  el.querySelector('#replay-total').textContent = entries.length;
}