/**
 * PixelVerse — Save & Export Modals.
 *
 * Interactive modals allowing users to:
 * 1. Perform local project auto-save & JSON backup.
 * 2. Save As Single Frame / Page (PNG, JPEG, BMP).
 * 3. Save As Multiple Frames / Sprite Sheet.
 * 4. Save As Studio Animations (GIF, WebP, MP4, Sprite Sheet).
 */

import {
  downloadSingleFrame,
  downloadSpriteSheet,
  downloadAnimatedGif,
  downloadAnimatedWebP,
  downloadMp4Video,
  gridToCanvas
} from '../animation/export.js';
import { serialise } from '../core/project.js';

let modalEl = null;
let currentState = null;
let currentTab = 'single'; // 'single' | 'multiple'
let currentFormat = 'png'; // 'png' | 'jpeg' | 'bmp'
let selectedFrameIndices = [];

// Studio Modal State
let studioModalEl = null;
let studioFormat = 'gif'; // 'gif' | 'webp' | 'mp4' | 'spritesheet'
let studioFps = 12;
let studioScale = 4;
let studioAnimTimer = null;
let studioPreviewFrameIdx = 0;

/**
 * Open the Editor Save & Export Modal.
 */
export function openSaveModal(state, onSaveProject) {
  currentState = state;

  if (!modalEl) {
    buildModal();
  }

  if (onSaveProject) {
    onSaveProject();
  }

  const totalFrames = state.frames?.length || 1;
  selectedFrameIndices = Array.from({ length: totalFrames }, (_, i) => i);

  const timeEl = modalEl.querySelector('#save-modal-timestamp');
  if (timeEl) {
    const now = new Date();
    timeEl.textContent = `Autosaved at ${now.toLocaleTimeString()}`;
  }

  populateFrameDropdown();
  populateFrameChecklist();
  updateFormatUI();
  updateTabUI();
  updatePreviews();

  modalEl.hidden = false;
  document.body.classList.add('is-modal-open');
}

/**
 * Close the Editor Save Modal.
 */
export function closeSaveModal() {
  if (modalEl) {
    modalEl.hidden = true;
  }
  document.body.classList.remove('is-modal-open');
}

/**
 * Open the Studio Animation Save Modal.
 */
export function openStudioSaveModal(state) {
  currentState = state;
  studioFps = state.fps || 12;

  if (!studioModalEl) {
    buildStudioModal();
  }

  updateStudioFormatUI();
  startStudioPreviewAnim();

  studioModalEl.hidden = false;
  document.body.classList.add('is-modal-open');
}

/**
 * Close the Studio Save Modal.
 */
export function closeStudioSaveModal() {
  if (studioModalEl) {
    studioModalEl.hidden = true;
  }
  if (studioAnimTimer) {
    clearInterval(studioAnimTimer);
    studioAnimTimer = null;
  }
  document.body.classList.remove('is-modal-open');
}

/**
 * Construct Editor Save Modal.
 */
function buildModal() {
  modalEl = document.createElement('div');
  modalEl.className = 'save-modal';
  modalEl.id = 'save-modal';
  modalEl.hidden = true;

  modalEl.innerHTML = `
    <div class="save-modal__backdrop"></div>
    <div class="save-modal__sheet">
      <div class="save-modal__head">
        <div class="save-modal__title-group">
          <h2 class="save-modal__title">SAVE & EXPORT</h2>
          <span class="save-modal__sub">Save project or export artwork</span>
        </div>
        <button class="save-modal__close" id="save-modal-close" title="Close">×</button>
      </div>

      <!-- Quick Save Confirmation -->
      <div class="save-modal__status-card">
        <div class="save-modal__status-info">
          <span class="save-modal__status-icon">💾</span>
          <div>
            <strong class="save-modal__status-label">Project Saved to Browser Storage</strong>
            <span class="save-modal__status-time" id="save-modal-timestamp">Saved</span>
          </div>
        </div>
        <button class="btn btn--ghost btn--sm" id="btn-modal-export-json" title="Download Project .json Backup">Export .json</button>
      </div>

      <!-- SAVE AS Section -->
      <div class="save-modal__section">
        <div class="save-modal__section-header">
          <span class="save-modal__section-title">SAVE AS</span>
          <span class="save-modal__section-hint">Hover or select export mode</span>
        </div>

        <div class="save-modal__save-as-container">
          <div class="save-modal__tabs">
            <div class="save-modal__tab is-active" data-tab="single" id="tab-single">
              <div class="save-modal__tab-header">
                <span class="save-modal__tab-icon">📄</span>
                <div class="save-modal__tab-info">
                  <strong>One Page (Single Image)</strong>
                  <span>Export current or selected page as image</span>
                </div>
              </div>
              <div class="save-modal__tab-badges">
                <span class="save-modal__badge">PNG</span>
                <span class="save-modal__badge">JPEG</span>
                <span class="save-modal__badge">BMP</span>
              </div>
            </div>

            <div class="save-modal__tab" data-tab="multiple" id="tab-multiple">
              <div class="save-modal__tab-header">
                <span class="save-modal__tab-icon">🎞️</span>
                <div class="save-modal__tab-info">
                  <strong>Multiple Pages / Frames</strong>
                  <span>Select frames and save into Sprite Sheet</span>
                </div>
              </div>
              <div class="save-modal__tab-badges">
                <span class="save-modal__badge save-modal__badge--lime">Sprite Sheet</span>
              </div>
            </div>
          </div>

          <!-- Single Page Export Panel -->
          <div class="save-modal__panel" id="panel-single">
            <div class="save-modal__panel-layout">
              <div class="save-modal__panel-opts">
                <div class="field field--block">
                  <span class="field__label">Select Image Format</span>
                  <div class="save-modal__format-group">
                    <button class="save-modal__fmt-btn is-active" data-fmt="png">
                      <span class="fmt-title">PNG Picture</span>
                      <span class="fmt-ext">.png (Transparent)</span>
                    </button>
                    <button class="save-modal__fmt-btn" data-fmt="jpeg">
                      <span class="fmt-title">JPEG Picture</span>
                      <span class="fmt-ext">.jpg (Solid White BG)</span>
                    </button>
                    <button class="save-modal__fmt-btn" data-fmt="bmp">
                      <span class="fmt-title">BMP Picture</span>
                      <span class="fmt-ext">.bmp (Bitmap)</span>
                    </button>
                  </div>
                </div>

                <div class="field field--block" id="single-frame-select-wrap">
                  <span class="field__label">Select Page / Frame</span>
                  <select class="select" id="single-frame-select"></select>
                </div>

                <div class="field field--block">
                  <span class="field__label">Resolution Scale</span>
                  <select class="select" id="single-scale-select">
                    <option value="1">1x Actual Pixels (32px)</option>
                    <option value="4">4x Medium (128px)</option>
                    <option value="8" selected>8x High Res (256px)</option>
                    <option value="16">16x Ultra HD (512px)</option>
                  </select>
                </div>

                <button class="btn btn--cyan btn--wide" id="btn-export-single">
                  <span>Download Image (<span id="export-single-fmt-label">PNG</span>)</span>
                  <span>↓</span>
                </button>
              </div>

              <div class="save-modal__preview-box">
                <span class="save-modal__preview-label">Image Preview</span>
                <canvas class="save-modal__preview-canvas" id="single-preview-canvas" width="192" height="192"></canvas>
              </div>
            </div>
          </div>

          <!-- Multiple Pages Export Panel -->
          <div class="save-modal__panel" id="panel-multiple" hidden>
            <div class="save-modal__panel-layout">
              <div class="save-modal__panel-opts">
                <div class="field field--block">
                  <div class="save-modal__frame-header">
                    <span class="field__label">Select Pages / Frames</span>
                    <div class="save-modal__frame-actions">
                      <button class="btn btn--ghost btn--xs" id="btn-frames-select-all">Select All</button>
                    </div>
                  </div>
                  <div class="save-modal__frame-list" id="multi-frame-list"></div>
                </div>

                <div class="field field--block">
                  <span class="field__label">Sprite Sheet Scale</span>
                  <select class="select" id="multi-scale-select">
                    <option value="1">1x Actual Pixels</option>
                    <option value="4" selected>4x High Res</option>
                    <option value="8">8x HD</option>
                  </select>
                </div>

                <button class="btn btn--lime btn--wide" id="btn-export-multi">
                  <span>Save as Combined Sprite Sheet (.png)</span>
                  <span>↓</span>
                </button>
              </div>

              <div class="save-modal__preview-box">
                <span class="save-modal__preview-label">Sprite Sheet Preview</span>
                <div class="save-modal__preview-scroll">
                  <canvas class="save-modal__preview-canvas" id="multi-preview-canvas" width="220" height="110"></canvas>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  modalEl.querySelector('#save-modal-close')?.addEventListener('click', closeSaveModal);
  modalEl.querySelector('.save-modal__backdrop')?.addEventListener('click', closeSaveModal);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.hidden) closeSaveModal();
  });

  const tabs = modalEl.querySelectorAll('.save-modal__tab');
  tabs.forEach(tab => {
    tab.addEventListener('mouseenter', () => {
      currentTab = tab.dataset.tab;
      updateTabUI();
      updatePreviews();
    });
    tab.addEventListener('click', () => {
      currentTab = tab.dataset.tab;
      updateTabUI();
      updatePreviews();
    });
  });

  const fmtBtns = modalEl.querySelectorAll('.save-modal__fmt-btn');
  fmtBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentFormat = btn.dataset.fmt;
      updateFormatUI();
      updatePreviews();
    });
  });

  modalEl.querySelector('#single-frame-select')?.addEventListener('change', updatePreviews);
  modalEl.querySelector('#single-scale-select')?.addEventListener('change', updatePreviews);
  modalEl.querySelector('#multi-scale-select')?.addEventListener('change', updatePreviews);

  modalEl.querySelector('#btn-frames-select-all')?.addEventListener('click', () => {
    const totalFrames = currentState.frames?.length || 1;
    selectedFrameIndices = Array.from({ length: totalFrames }, (_, i) => i);
    const checkboxes = modalEl.querySelectorAll('.multi-frame-cb');
    checkboxes.forEach(cb => { cb.checked = true; });
    updatePreviews();
  });

  modalEl.querySelector('#btn-modal-export-json')?.addEventListener('click', () => {
    if (!currentState) return;
    const jsonStr = JSON.stringify(serialise(currentState), null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `pixelverse-project-${Date.now()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
  });

  modalEl.querySelector('#btn-export-single')?.addEventListener('click', () => {
    if (!currentState) return;
    const frameSelect = modalEl.querySelector('#single-frame-select');
    const frameIdx = parseInt(frameSelect?.value || '0', 10);
    const scaleSelect = modalEl.querySelector('#single-scale-select');
    const scale = parseInt(scaleSelect?.value || '8', 10);

    const frame = currentState.frames?.[frameIdx] || currentState.frames?.[0];
    if (!frame) return;

    downloadSingleFrame(frame.grid, currentFormat, `pixelverse-page-${frameIdx + 1}`, scale);
  });

  modalEl.querySelector('#btn-export-multi')?.addEventListener('click', () => {
    if (!currentState || !currentState.frames) return;
    const scaleSelect = modalEl.querySelector('#multi-scale-select');
    const scale = parseInt(scaleSelect?.value || '4', 10);

    if (selectedFrameIndices.length === 0) {
      alert('Please select at least one frame/page to include in the sprite sheet.');
      return;
    }

    downloadSpriteSheet(currentState.frames, currentState.gridSize, selectedFrameIndices, scale);
  });
}

/**
 * Construct Studio Animation Save Modal.
 */
function buildStudioModal() {
  studioModalEl = document.createElement('div');
  studioModalEl.className = 'save-modal';
  studioModalEl.id = 'studio-save-modal';
  studioModalEl.hidden = true;

  studioModalEl.innerHTML = `
    <div class="save-modal__backdrop"></div>
    <div class="save-modal__sheet">
      <div class="save-modal__head">
        <div class="save-modal__title-group">
          <h2 class="save-modal__title">STUDIO ANIMATION EXPORT</h2>
          <span class="save-modal__sub">Save your sequence as GIF, WebP, MP4, or Sprite Sheet</span>
        </div>
        <button class="save-modal__close" id="studio-modal-close" title="Close">×</button>
      </div>

      <div class="save-modal__section">
        <div class="save-modal__section-header">
          <span class="save-modal__section-title">SAVE AS</span>
          <span class="save-modal__section-hint">Select animation format</span>
        </div>

        <div class="save-modal__format-group save-modal__format-group--4">
          <button class="save-modal__fmt-btn is-active" data-sfmt="gif">
            <span class="fmt-title">GIF Animation</span>
            <span class="fmt-ext">.gif (Animated)</span>
          </button>
          <button class="save-modal__fmt-btn" data-sfmt="webp">
            <span class="fmt-title">WebP Animation</span>
            <span class="fmt-ext">.webp (High Quality)</span>
          </button>
          <button class="save-modal__fmt-btn" data-sfmt="mp4">
            <span class="fmt-title">MP4 Video</span>
            <span class="fmt-ext">.mp4 (Video Stream)</span>
          </button>
          <button class="save-modal__fmt-btn" data-sfmt="spritesheet">
            <span class="fmt-title">Sprite Sheet</span>
            <span class="fmt-ext">.png (Grid Strip)</span>
          </button>
        </div>

        <div class="save-modal__panel">
          <div class="save-modal__panel-layout">
            <div class="save-modal__panel-opts">
              <label class="field field--block">
                <span class="field__label">Frame Rate (FPS)</span>
                <select class="select" id="studio-fps-select">
                  <option value="8">8 FPS</option>
                  <option value="12" selected>12 FPS (Standard)</option>
                  <option value="16">16 FPS</option>
                  <option value="24">24 FPS (Cinematic)</option>
                  <option value="30">30 FPS (Smooth)</option>
                </select>
              </label>

              <label class="field field--block">
                <span class="field__label">Resolution Scale</span>
                <select class="select" id="studio-scale-select">
                  <option value="1">1x Actual Pixels (32px)</option>
                  <option value="4" selected>4x High Res (128px)</option>
                  <option value="8">8x HD (256px)</option>
                  <option value="16">16x Ultra HD (512px)</option>
                </select>
              </label>

              <button class="btn btn--gold btn--wide" id="btn-export-studio-action">
                <span>Save Animation as <span id="studio-export-fmt-label">GIF</span></span>
                <span>↓</span>
              </button>
            </div>

            <div class="save-modal__preview-box">
              <span class="save-modal__preview-label">Live Animation Preview</span>
              <canvas class="save-modal__preview-canvas" id="studio-preview-canvas" width="192" height="192"></canvas>
              <span class="save-modal__preview-sub" id="studio-preview-sub-info">Sequence Preview</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(studioModalEl);

  studioModalEl.querySelector('#studio-modal-close')?.addEventListener('click', closeStudioSaveModal);
  studioModalEl.querySelector('.save-modal__backdrop')?.addEventListener('click', closeStudioSaveModal);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !studioModalEl.hidden) closeStudioSaveModal();
  });

  const fmtBtns = studioModalEl.querySelectorAll('.save-modal__fmt-btn');
  fmtBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      studioFormat = btn.dataset.sfmt;
      updateStudioFormatUI();
      startStudioPreviewAnim();
    });
  });

  studioModalEl.querySelector('#studio-fps-select')?.addEventListener('change', (e) => {
    studioFps = parseInt(e.target.value, 10);
    startStudioPreviewAnim();
  });

  studioModalEl.querySelector('#studio-scale-select')?.addEventListener('change', (e) => {
    studioScale = parseInt(e.target.value, 10);
    renderStudioPreviewFrame();
  });

  studioModalEl.querySelector('#btn-export-studio-action')?.addEventListener('click', () => {
    if (!currentState || !currentState.frames || currentState.frames.length === 0) return;

    if (studioFormat === 'gif') {
      downloadAnimatedGif(currentState.frames, currentState.gridSize, studioFps, studioScale);
    } else if (studioFormat === 'webp') {
      downloadAnimatedWebP(currentState.frames, currentState.gridSize, studioFps, studioScale);
    } else if (studioFormat === 'mp4') {
      downloadMp4Video(currentState.frames, currentState.gridSize, studioFps, studioScale);
    } else if (studioFormat === 'spritesheet') {
      downloadSpriteSheet(currentState.frames, currentState.gridSize, null, studioScale);
    }
  });
}

function updateStudioFormatUI() {
  if (!studioModalEl) return;
  const fmtBtns = studioModalEl.querySelectorAll('.save-modal__fmt-btn');
  fmtBtns.forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.sfmt === studioFormat);
  });

  const labelEl = studioModalEl.querySelector('#studio-export-fmt-label');
  if (labelEl) {
    labelEl.textContent = studioFormat.toUpperCase();
  }
}

function startStudioPreviewAnim() {
  if (studioAnimTimer) clearInterval(studioAnimTimer);
  studioPreviewFrameIdx = 0;

  renderStudioPreviewFrame();

  const intervalMs = Math.round(1000 / Math.max(1, studioFps));
  studioAnimTimer = setInterval(() => {
    if (!currentState || !currentState.frames || currentState.frames.length === 0) return;
    studioPreviewFrameIdx = (studioPreviewFrameIdx + 1) % currentState.frames.length;
    renderStudioPreviewFrame();
  }, intervalMs);
}

function renderStudioPreviewFrame() {
  if (!studioModalEl || !currentState || !currentState.frames) return;
  const previewCanvas = studioModalEl.querySelector('#studio-preview-canvas');
  const subInfo = studioModalEl.querySelector('#studio-preview-sub-info');
  if (!previewCanvas) return;

  const totalFrames = currentState.frames.length;
  if (subInfo) {
    subInfo.textContent = `${totalFrames} frame${totalFrames > 1 ? 's' : ''} @ ${studioFps} FPS`;
  }

  const ctx = previewCanvas.getContext('2d');
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.imageSmoothingEnabled = false;

  if (studioFormat === 'spritesheet') {
    // Draw full sprite sheet in preview
    const count = totalFrames;
    const itemWidth = Math.min(180 / count, 48);
    previewCanvas.width = count * itemWidth;
    previewCanvas.height = itemWidth;

    currentState.frames.forEach((f, i) => {
      const fc = gridToCanvas(f.grid, 2);
      if (fc) {
        ctx.drawImage(fc, i * itemWidth, 0, itemWidth, itemWidth);
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1;
        ctx.strokeRect(i * itemWidth, 0, itemWidth, itemWidth);
      }
    });
  } else {
    previewCanvas.width = 192;
    previewCanvas.height = 192;

    drawCheckerboard(ctx, 192, 192);

    const frame = currentState.frames[studioPreviewFrameIdx] || currentState.frames[0];
    if (frame) {
      const bg = (studioFormat === 'mp4') ? '#0d1017' : 'transparent';
      const fc = gridToCanvas(frame.grid, 6, { background: bg });
      if (fc) {
        ctx.drawImage(fc, 0, 0, 192, 192);
      }
    }
  }
}

function populateFrameDropdown() {
  const selectEl = modalEl.querySelector('#single-frame-select');
  if (!selectEl || !currentState) return;

  const frames = currentState.frames || [];
  const activeFrame = currentState.activeFrame || 0;

  selectEl.innerHTML = frames.map((_, i) => `
    <option value="${i}" ${i === activeFrame ? 'selected' : ''}>
      Page / Frame ${i + 1} ${i === activeFrame ? '(Current Active)' : ''}
    </option>
  `).join('');
}

function populateFrameChecklist() {
  const listEl = modalEl.querySelector('#multi-frame-list');
  if (!listEl || !currentState) return;

  const frames = currentState.frames || [];

  listEl.innerHTML = frames.map((f, i) => {
    const isChecked = selectedFrameIndices.includes(i);
    return `
      <label class="save-modal__frame-item">
        <input type="checkbox" class="multi-frame-cb" data-idx="${i}" ${isChecked ? 'checked' : ''} />
        <span class="save-modal__frame-thumb-wrap">
          <canvas class="save-modal__frame-thumb" data-idx="${i}" width="32" height="32"></canvas>
        </span>
        <span class="save-modal__frame-name">Frame ${i + 1}</span>
      </label>
    `;
  }).join('');

  frames.forEach((f, i) => {
    const thumbCanvas = listEl.querySelector(`canvas[data-idx="${i}"]`);
    if (thumbCanvas) {
      const miniCanvas = gridToCanvas(f.grid, 1);
      if (miniCanvas) {
        const ctx = thumbCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(miniCanvas, 0, 0, 32, 32);
      }
    }
  });

  const checkboxes = listEl.querySelectorAll('.multi-frame-cb');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = parseInt(cb.dataset.idx, 10);
      if (cb.checked) {
        if (!selectedFrameIndices.includes(idx)) selectedFrameIndices.push(idx);
      } else {
        selectedFrameIndices = selectedFrameIndices.filter(i => i !== idx);
      }
      updatePreviews();
    });
  });
}

function updateFormatUI() {
  const fmtBtns = modalEl.querySelectorAll('.save-modal__fmt-btn');
  fmtBtns.forEach(btn => {
    const isCurrent = btn.dataset.fmt === currentFormat;
    btn.classList.toggle('is-active', isCurrent);
  });

  const labelEl = modalEl.querySelector('#export-single-fmt-label');
  if (labelEl) {
    labelEl.textContent = currentFormat.toUpperCase();
  }
}

function updateTabUI() {
  const tabs = modalEl.querySelectorAll('.save-modal__tab');
  tabs.forEach(tab => {
    tab.classList.toggle('is-active', tab.dataset.tab === currentTab);
  });

  const panelSingle = modalEl.querySelector('#panel-single');
  const panelMulti = modalEl.querySelector('#panel-multiple');

  if (panelSingle) panelSingle.hidden = currentTab !== 'single';
  if (panelMulti) panelMulti.hidden = currentTab !== 'multiple';
}

function updatePreviews() {
  if (!modalEl || !currentState) return;

  if (currentTab === 'single') {
    const previewCanvas = modalEl.querySelector('#single-preview-canvas');
    if (previewCanvas) {
      const frameSelect = modalEl.querySelector('#single-frame-select');
      const frameIdx = parseInt(frameSelect?.value || '0', 10);
      const frame = currentState.frames?.[frameIdx] || currentState.frames?.[0];

      if (frame) {
        const bg = currentFormat === 'jpeg' ? '#ffffff' : 'transparent';
        const rendered = gridToCanvas(frame.grid, 6, { background: bg });
        const ctx = previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        ctx.imageSmoothingEnabled = false;

        if (currentFormat !== 'jpeg') {
          drawCheckerboard(ctx, previewCanvas.width, previewCanvas.height);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
        }

        if (rendered) {
          ctx.drawImage(rendered, 0, 0, previewCanvas.width, previewCanvas.height);
        }
      }
    }
  } else {
    const previewCanvas = modalEl.querySelector('#multi-preview-canvas');
    if (previewCanvas && currentState.frames) {
      const indices = selectedFrameIndices.slice().sort((a, b) => a - b);
      const selectedFrames = indices.map(i => currentState.frames[i]).filter(Boolean);

      const count = Math.max(1, selectedFrames.length);
      const frameSize = 100;
      previewCanvas.width = count * frameSize;
      previewCanvas.height = frameSize;

      const ctx = previewCanvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;

      drawCheckerboard(ctx, previewCanvas.width, previewCanvas.height);

      selectedFrames.forEach((f, i) => {
        const fc = gridToCanvas(f.grid, 3);
        if (fc) {
          ctx.drawImage(fc, i * frameSize, 0, frameSize, frameSize);
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1;
          ctx.strokeRect(i * frameSize, 0, frameSize, frameSize);
        }
      });
    }
  }
}

function drawCheckerboard(ctx, width, height) {
  const size = 12;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      const alt = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = alt ? '#1e293b' : '#0f172a';
      ctx.fillRect(x, y, size, size);
    }
  }
}
