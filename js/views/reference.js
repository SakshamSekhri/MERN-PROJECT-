/**
 * Reference workspace.
 *
 * The "Create from image" path: upload a photo, convert it into a pixelated
 * reference grid, then carry that grid into the editor to trace over.
 *
 * The uploaded image is never the artwork. It becomes a reference the artist
 * recreates by hand — which is why this view ends by handing a *grid* to the
 * editor, not an image.
 *
 * Conversion is DELIBERATE, not automatic. Uploading shows you the photo and
 * the controls; nothing is pixelated until you press Convert. Changing a
 * setting afterwards marks the preview stale rather than silently redoing the
 * work, so the button always corresponds to a visible change.
 */

import { state } from '../core/state.js';
import { imageToGrid, loadImageFromFile, releaseImage } from '../image/pixelate.js';
import { drawThumbnail } from '../canvas/renderer.js';
import { go } from '../core/router.js';

let sourceImage = null;
let result = null;          // { grid, palette, colorsBefore } — null until converted
let stale = false;          // options changed since the last conversion

export function initReference() {
  bindUpload();
  bindOptions();
  bindActions();
  bindContextMenu();
  showStep('upload');
}

/* ─────────────── steps ─────────────── */

function showStep(step) {
  document.getElementById('ref-upload').hidden = step !== 'upload';
  document.getElementById('ref-workspace').hidden = step === 'upload';
}

/* ─────────────── upload ─────────────── */

function bindUpload() {
  const input = document.getElementById('ref-file');
  const drop = document.getElementById('ref-drop');

  input.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  drop.addEventListener('click', () => input.click());

  // dragover must be prevented or the browser navigates to the dropped file
  // instead of handing it to us.
  ['dragenter', 'dragover'].forEach(type => {
    drop.addEventListener(type, e => {
      e.preventDefault();
      drop.classList.add('is-over');
    });
  });
  ['dragleave', 'drop'].forEach(type => {
    drop.addEventListener(type, e => {
      e.preventDefault();
      drop.classList.remove('is-over');
    });
  });
  drop.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
}

async function handleFile(file) {
  const error = document.getElementById('ref-error');
  error.textContent = '';
  try {
    // Free the previous blob URL before replacing it, or every upload in a
    // session leaks its image.
// Free the previous blob URL before replacing it, or every upload in a
    // session leaks its image — unless the editor is still using it as a
    // live reference, in which case revoking would break re-pixelation.
    if (sourceImage !== state.reference?.image) releaseImage(sourceImage);

    sourceImage = await loadImageFromFile(file);
    document.getElementById('ref-source').src = sourceImage.src;
    document.getElementById('ref-filename').textContent = file.name;
    document.getElementById('ref-dims').textContent =
      `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight}`;

    // Deliberately NOT converting here. The user chooses settings first.
    result = null;
    stale = false;
    clearPreview();
    showStep('workspace');
    updateUI();
  } catch (err) {
    error.textContent = err.message;
  }
}

/* ─────────────── conversion ─────────────── */

function readOptions() {
  return {
    gridSize: Number(document.getElementById('ref-size').value),
    fit: document.getElementById('ref-fit').value,
    paletteSize: Number(document.getElementById('ref-colors').value),
    method: document.getElementById('ref-method').value,
  };
}

function convert() {
  if (!sourceImage) return;
  const { gridSize, fit, paletteSize, method } = readOptions();

  result = imageToGrid(sourceImage, gridSize, { fit, paletteSize, method });
  stale = false;

  drawThumbnail(document.getElementById('ref-preview'), result.grid);

  document.getElementById('ref-stat-cells').textContent = `${gridSize} × ${gridSize}`;
  document.getElementById('ref-stat-before').textContent = result.colorsBefore;
  document.getElementById('ref-stat-after').textContent = result.palette.length;

  renderPalette(result.palette);
  updateUI();
  flashPreview();
}

/** Blank the preview back to its "not converted yet" state. */
function clearPreview() {
  const canvas = document.getElementById('ref-preview');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  document.getElementById('ref-stat-cells').textContent = '—';
  document.getElementById('ref-stat-before').textContent = '—';
  document.getElementById('ref-stat-after').textContent = '—';
  document.getElementById('ref-palette').innerHTML = '';
}

function renderPalette(palette) {
  const wrap = document.getElementById('ref-palette');
  wrap.innerHTML = '';
  palette.forEach(hex => {
    const chip = document.createElement('span');
    chip.className = 'ref-chip';
    chip.style.background = hex;
    chip.title = hex;
    wrap.appendChild(chip);
  });
}

/**
 * Changing a setting does not reconvert. It marks the preview stale so the
 * Convert button always corresponds to a change the user can see happen.
 */
function bindOptions() {
  ['ref-size', 'ref-fit', 'ref-colors', 'ref-method'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      if (result) stale = true;
      updateUI();
    });
  });
}

/* ─────────────── UI state ─────────────── */

/**
 * Three states, and the UI has to be unambiguous about which one it is in:
 *   not converted  — empty preview, Convert is the primary action
 *   converted      — preview live, Use as reference unlocked
 *   stale          — preview shows the OLD settings, Convert flagged again
 */
function updateUI() {
  const placeholder = document.getElementById('ref-placeholder');
  const convertBtn = document.getElementById('btn-ref-convert');
  const useBtn = document.getElementById('btn-ref-use');
  const status = document.getElementById('ref-status');
  const canvas = document.getElementById('ref-preview');

  const converted = result !== null;

  placeholder.hidden = converted;
  canvas.hidden = !converted;
  canvas.classList.toggle('is-stale', stale);

  useBtn.disabled = !converted || stale;

  convertBtn.classList.toggle('btn--cyan', !converted || stale);
  convertBtn.classList.toggle('btn--ghost', converted && !stale);
  convertBtn.textContent = converted ? 'Convert again' : 'Convert to pixel art';

  status.textContent = !converted
    ? 'Pick your settings, then convert'
    : stale
      ? 'Settings changed — convert again to update'
      : 'Ready to use as a reference';
  status.classList.toggle('is-warn', stale);
}

let flashTimer = null;
function flashPreview() {
  const canvas = document.getElementById('ref-preview');
  clearTimeout(flashTimer);
  canvas.classList.remove('is-flash');
  void canvas.offsetWidth;              // restart the animation
  canvas.classList.add('is-flash');
  flashTimer = setTimeout(() => canvas.classList.remove('is-flash'), 900);
}

/* ─────────────── actions ─────────────── */

function bindActions() {
  document.getElementById('btn-ref-convert').addEventListener('click', convert);

  document.getElementById('btn-ref-use').addEventListener('click', () => {
    if (!result || stale) return;
    // Hand the editor a grid, not an image. Milestone 6 renders it beside
    // the drawing canvas; for now it also sets the working resolution.
// Keep the source image and the settings used, not just the grid.
    // Changing the canvas size later re-pixelates from the original photo,
    // which is far better than rescaling an already-pixelated grid.
    state.reference = {
      grid: result.grid,
      palette: result.palette,
      image: sourceImage,
      options: readOptions(),
    };
    state.gridSize = result.grid.length;
    const sizeSelect = document.getElementById('grid-size');
    sizeSelect.value = String(state.gridSize);
    sizeSelect.dispatchEvent(new Event('change'));
    go('editor');
  });

  document.getElementById('btn-ref-reset').addEventListener('click', () => {
    if (sourceImage !== state.reference?.image) releaseImage(sourceImage);
    releaseImage(sourceImage);
    sourceImage = null;
    result = null;
    stale = false;
    document.getElementById('ref-file').value = '';
    clearPreview();
    showStep('upload');
  });

  document.getElementById('btn-ref-back').addEventListener('click', () => go('landing'));

  document.getElementById('btn-ref-hide').addEventListener('click', e => {
    const panel = document.getElementById('ref-source-panel');
    panel.classList.toggle('is-hidden');
    e.target.textContent = panel.classList.contains('is-hidden')
      ? 'Show original'
      : 'Hide original';
  });
}

/* ─────────────── right-click shortcut ─────────────── */

/**
 * The spec asks for a right-click menu on the image. It is a shortcut, never
 * the only route — every entry here also exists as a visible button, since a
 * user who never right-clicks must still be able to reach everything.
 */
function bindContextMenu() {
  const img = document.getElementById('ref-source');
  const menu = document.getElementById('ref-menu');

  img.addEventListener('contextmenu', e => {
    e.preventDefault();
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.hidden = false;
  });

  document.addEventListener('click', () => { menu.hidden = true; });
  document.addEventListener('scroll', () => { menu.hidden = true; }, true);

  menu.addEventListener('click', e => {
    const action = e.target.dataset.menu;
    if (!action) return;
    if (action === 'convert') convert();
    if (action === 'hide') document.getElementById('btn-ref-hide').click();
    if (action === 'remove') document.getElementById('btn-ref-reset').click();
    if (action === 'resolution') document.getElementById('ref-size').focus();
    menu.hidden = true;
  });
}