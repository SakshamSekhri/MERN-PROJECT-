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
  const uploadEl = document.getElementById('ref-upload');
  if (uploadEl) uploadEl.hidden = step !== 'upload';
  const workspaceEl = document.getElementById('ref-workspace');
  if (workspaceEl) workspaceEl.hidden = step === 'upload';
}

/* ─────────────── upload ─────────────── */

function bindUpload() {
  const input = document.getElementById('ref-file');
  const drop = document.getElementById('ref-drop');

  if (input) {
    input.addEventListener('change', e => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });
  }

  if (drop) {
    drop.addEventListener('click', () => input?.click());

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
}

async function handleFile(file) {
  const error = document.getElementById('ref-error');
  if (error) error.textContent = '';
  try {
    if (sourceImage !== state.reference?.image) releaseImage(sourceImage);

    sourceImage = await loadImageFromFile(file);
    const srcEl = document.getElementById('ref-source');
    if (srcEl) srcEl.src = sourceImage.src;
    const nameEl = document.getElementById('ref-filename');
    if (nameEl) nameEl.textContent = file.name;
    const dimsEl = document.getElementById('ref-dims');
    if (dimsEl) {
      dimsEl.textContent = `${sourceImage.naturalWidth} × ${sourceImage.naturalHeight}`;
    }

    result = null;
    stale = false;
    clearPreview();
    showStep('workspace');
    updateUI();
  } catch (err) {
    if (error) error.textContent = err.message;
  }
}

/* ─────────────── conversion ─────────────── */

function readOptions() {
  const sizeEl = document.getElementById('ref-size');
  const fitEl = document.getElementById('ref-fit');
  const colorsEl = document.getElementById('ref-colors');
  const methodEl = document.getElementById('ref-method');
  return {
    gridSize: sizeEl ? Number(sizeEl.value) : 32,
    fit: fitEl ? fitEl.value : 'cover',
    paletteSize: colorsEl ? Number(colorsEl.value) : 16,
    method: methodEl ? methodEl.value : 'median-cut',
  };
}

function convert() {
  if (!sourceImage) return;
  const { gridSize, fit, paletteSize, method } = readOptions();

  result = imageToGrid(sourceImage, gridSize, { fit, paletteSize, method });
  stale = false;

  const previewCanvas = document.getElementById('ref-preview');
  if (previewCanvas) drawThumbnail(previewCanvas, result.grid);

  const cellsEl = document.getElementById('ref-stat-cells');
  if (cellsEl) cellsEl.textContent = `${gridSize} × ${gridSize}`;
  const beforeEl = document.getElementById('ref-stat-before');
  if (beforeEl) beforeEl.textContent = result.colorsBefore;
  const afterEl = document.getElementById('ref-stat-after');
  if (afterEl) afterEl.textContent = result.palette.length;

  renderPalette(result.palette);
  updateUI();
  flashPreview();
}

/** Blank the preview back to its "not converted yet" state. */
function clearPreview() {
  const canvas = document.getElementById('ref-preview');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const cellsEl = document.getElementById('ref-stat-cells');
  if (cellsEl) cellsEl.textContent = '—';
  const beforeEl = document.getElementById('ref-stat-before');
  if (beforeEl) beforeEl.textContent = '—';
  const afterEl = document.getElementById('ref-stat-after');
  if (afterEl) afterEl.textContent = '—';
  const paletteEl = document.getElementById('ref-palette');
  if (paletteEl) paletteEl.innerHTML = '';
}

function renderPalette(palette) {
  const wrap = document.getElementById('ref-palette');
  if (!wrap) return;
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
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        if (result) stale = true;
        updateUI();
      });
    }
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

  if (placeholder) placeholder.hidden = converted;
  if (canvas) {
    canvas.hidden = !converted;
    canvas.classList.toggle('is-stale', stale);
  }

  if (useBtn) useBtn.disabled = !converted || stale;

  if (convertBtn) {
    convertBtn.classList.toggle('btn--cyan', !converted || stale);
    convertBtn.classList.toggle('btn--ghost', converted && !stale);
    convertBtn.textContent = converted ? 'Convert again' : 'Convert to pixel art';
  }

  if (status) {
    status.textContent = !converted
      ? 'Pick your settings, then convert'
      : stale
        ? 'Settings changed — convert again to update'
        : 'Ready to use as a reference';
    status.classList.toggle('is-warn', stale);
  }
}

let flashTimer = null;
function flashPreview() {
  const canvas = document.getElementById('ref-preview');
  if (!canvas) return;
  clearTimeout(flashTimer);
  canvas.classList.remove('is-flash');
  void canvas.offsetWidth;              // restart the animation
  canvas.classList.add('is-flash');
  flashTimer = setTimeout(() => canvas.classList.remove('is-flash'), 900);
}

/* ─────────────── actions ─────────────── */

function bindActions() {
  const convertBtn = document.getElementById('btn-ref-convert');
  if (convertBtn) convertBtn.addEventListener('click', convert);

  const useBtn = document.getElementById('btn-ref-use');
  if (useBtn) {
    useBtn.addEventListener('click', () => {
      if (!result || stale) return;
      state.reference = {
        grid: result.grid,
        palette: result.palette,
        image: sourceImage,
        options: readOptions(),
      };
      state.gridSize = result.grid.length;
      const sizeSelect = document.getElementById('grid-size');
      if (sizeSelect) {
        sizeSelect.value = String(state.gridSize);
        sizeSelect.dispatchEvent(new Event('change'));
      }
      go('editor');
    });
  }

  const resetBtn = document.getElementById('btn-ref-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (sourceImage !== state.reference?.image) releaseImage(sourceImage);
      releaseImage(sourceImage);
      sourceImage = null;
      result = null;
      stale = false;
      const fileInput = document.getElementById('ref-file');
      if (fileInput) fileInput.value = '';
      clearPreview();
      showStep('upload');
    });
  }

  const refBack = document.getElementById('btn-ref-back');
  if (refBack) {
    refBack.addEventListener('click', (e) => {
      window.location.href = 'index.html';
    });
  }

  const hideBtn = document.getElementById('btn-ref-hide');
  if (hideBtn) {
    hideBtn.addEventListener('click', e => {
      const panel = document.getElementById('ref-source-panel');
      if (!panel) return;
      panel.classList.toggle('is-hidden');
      e.target.textContent = panel.classList.contains('is-hidden')
        ? 'Show original'
        : 'Hide original';
    });
  }
}

/* ─────────────── right-click shortcut ─────────────── */

function bindContextMenu() {
  const img = document.getElementById('ref-source');
  const menu = document.getElementById('ref-menu');
  if (!img || !menu) return;

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
    if (action === 'hide') document.getElementById('btn-ref-hide')?.click();
    if (action === 'remove') document.getElementById('btn-ref-reset')?.click();
    if (action === 'resolution') document.getElementById('ref-size')?.focus();
    menu.hidden = true;
  });
}