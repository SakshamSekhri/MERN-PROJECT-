/**
 * Global application state.
 *
 * Single source of truth. Views read from it, never hold their own copy.
 *
 * As of Milestone 2 there is no single `grid` any more — the canvas always
 * edits `frames[activeFrame].grid`. Use currentFrame() rather than reaching
 * into the array, so the "which frame am I editing" rule lives in one place.
 */

export const state = {
  view: 'landing',

  // canvas
  gridSize: 32,
  showGridLines: true,

  // drawing
  tool: 'pencil',
  color: '#ff2e88',
  recentColors: [],

  // frames
  frames: [],          // [{ id, grid, history }] — see frames/frameManager.js
  activeFrame: 0,
  // onion skin — display only, never merged into the active grid
  onionEnabled: true,
  onionOpacity: 0.3,

  // animation (milestone 4)
  fps: 12,
  loop: true,
  // reference (milestone 5) — { grid, palette } or null
  reference: null,
};

/** The frame currently being edited. */
export function currentFrame() {
  return state.frames[state.activeFrame];
}

/** Shorthand for the grid under the brush. */
export function currentGrid() {
  return currentFrame().grid;
}

/** Shorthand for the undo stack of the frame under the brush. */
export function currentHistory() {
  return currentFrame().history;
}

/** Default 16-colour palette — warm/cool spread that suits sprite work. */
export const PALETTE = [
  '#12101c', '#3b2f5e', '#6f668f', '#e8e4f5',
  '#ff2e88', '#f43f5e', '#fb923c', '#fbbf24',
  '#a3e635', '#22c55e', '#14b8a6', '#22d3ee',
  '#3b82f6', '#a855f7', '#d946ef', '#ffffff',
];

/** Track a colour in the recent list (most recent first, max 6). */
export function pushRecentColor(hex) {
  state.recentColors = [hex, ...state.recentColors.filter(c => c !== hex)].slice(0, 6);
}