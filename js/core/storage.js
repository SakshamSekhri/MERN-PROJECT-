/**
 * LocalStorage wrapper.
 *
 * Everything is namespaced under pixelverse: so we never collide with
 * anything else on the origin. Milestone 8 builds real project save/load
 * on top of these primitives.
 */

const NS = 'pixelverse:';

export function save(key, value) {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('[storage] save failed', err);
    return false;
  }
}

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn('[storage] load failed', err);
    return fallback;
  }
}

export function remove(key) {
  localStorage.removeItem(NS + key);
}