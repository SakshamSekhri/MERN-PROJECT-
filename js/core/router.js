/**
 * Minimal view router.
 *
 * Every screen is a <section class="view" id="view-{name}">. Switching just
 * toggles .is-active — no page loads, so in-memory state (frames, history)
 * survives navigation between the editor and the animation studio.
 */

import { state } from './state.js';

const listeners = {};

/** Register a callback fired when a view becomes active. */
export function onEnter(name, fn) {
  (listeners[name] ||= []).push(fn);
}

export function go(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
  const target = document.getElementById(`view-${name}`);
  if (!target) {
    console.warn(`[router] no view named "${name}"`);
    return;
  }
  target.classList.add('is-active');
  state.view = name;
  (listeners[name] || []).forEach(fn => fn());
}