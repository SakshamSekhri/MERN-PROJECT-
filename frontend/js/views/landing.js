/**
 * Landing view.
 *
 * The hero canvas replays a sprite being built one cell at a time, then wipes
 * and starts over. It is a live preview of the replay feature that Phase 2
 * builds for real — the same idea, driven by a hardcoded list instead of a
 * server-side delta log.
 */

import { go } from '../core/router.js';
import { state } from '../core/state.js';
import { releaseImage } from '../image/pixelate.js';

// A 16×16 sprite, described as [x, y, colour] in drawing order.
// Order matters: this *is* the delta list.
const SPRITE_SIZE = 16;

const PALETTE = {
  s: '#3b2f5e',   // outline
  h: '#ff2e88',   // head
  b: '#22d3ee',   // body
  w: '#e8e4f5',   // eye white
  y: '#fbbf24',   // feet
};

const ROWS = [
  '................',
  '.....ssssss.....',
  '....shhhhhhs....',
  '...shhhhhhhhs...',
  '...shhwwhhwwhs..',
  '...shhwshhwshs..',
  '...shhhhhhhhs...',
  '....shhhhhhs....',
  '.....sbbbbs.....',
  '....sbbbbbbs....',
  '...sbbbbbbbbs...',
  '...sbb.bb.bbs...',
  '...sbb.bb.bbs...',
  '....ss.ss.ss....',
  '.....y....y.....',
  '................',
];

function buildSprite() {
  const out = [];
  for (let y = 0; y < ROWS.length; y++) {
    for (let x = 0; x < ROWS[y].length; x++) {
      const ch = ROWS[y][x];
      if (ch === '.') continue;
      const color = PALETTE[ch];
      if (color) out.push([x, y, color]);   // skip unknown chars, never throw
    }
  }
  return out;
}

const SPRITE = buildSprite();

export function initLanding() {
  // Bind navigation FIRST. Anything below can fail without leaving the user
  // stuck on a dead button.
  const blank = document.querySelector('[data-action="blank"]');
  if (blank) blank.addEventListener('click', (e) => {
    if (state.reference) {
      releaseImage(state.reference.image);
      state.reference = null;
      state.refUnderlay = false;
    }
    window.location.href = 'blank.html';
  });

  const image = document.querySelector('[data-action="image"]');
  if (image) image.addEventListener('click', (e) => {
    window.location.href = 'image.html';
  });

  const canvas = document.getElementById('hero-canvas');
  const countEl = document.getElementById('hero-count');
  if (!canvas || !countEl) return;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const cs = canvas.width / SPRITE_SIZE;

  function wipe() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let by = 0; by < SPRITE_SIZE / 2; by++) {
      for (let bx = 0; bx < SPRITE_SIZE / 2; bx++) {
        ctx.fillStyle = (bx + by) % 2 === 0 ? '#1b1730' : '#221c3a';
        ctx.fillRect(bx * cs * 2, by * cs * 2, cs * 2, cs * 2);
      }
    }
  }

  function paintCell(n) {
    const [x, y, color] = SPRITE[n];
    ctx.fillStyle = color;
    ctx.fillRect(x * cs, y * cs, cs, cs);
  }

  wipe();

  // Static render for anyone who has asked for less motion.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    for (let n = 0; n < SPRITE.length; n++) paintCell(n);
    countEl.textContent = SPRITE.length;
    return;
  }

  // ── replay loop ──
  // Three states: DRAWING adds a cell every tick, HOLDING pauses on the
  // finished sprite, then we wipe and start over. A single state variable
  // replaces the setTimeout-plus-timestamp juggling this had before, which
  // could wipe the canvas *after* the next pass had already started drawing.
  const TICK_MS = 26;
  const HOLD_MS = 1400;

  let cursor = 0;
  let holding = false;
  let holdStarted = 0;
  let lastTick = 0;

  function frame(now) {
    if (holding) {
      if (now - holdStarted >= HOLD_MS) {
        holding = false;
        cursor = 0;
        countEl.textContent = '0';
        wipe();
        lastTick = now;
      }
    } else if (now - lastTick >= TICK_MS) {
      lastTick = now;
      paintCell(cursor);
      cursor++;
      countEl.textContent = cursor;

      if (cursor >= SPRITE.length) {
        holding = true;
        holdStarted = now;
      }
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}