/**
 * PixelVerse — Save & Export Modal.
 *
 * Interactive modal allowing users to:
 * 1. Perform local project auto-save & JSON backup.
 * 2. Save As Single Frame / Page:
 *    - Formats: PNG Picture (.png), JPEG Picture (.jpg), BMP Picture (.bmp)
 * 3. Save As Multiple Frames / Pages:
 *    - Frame selection & Multi-frame Sprite Sheet generator (.png)
 */

import { downloadSingleFrame, downloadSpriteSheet, gridToCanvas } from '../animation/export.js';
import { serialise } from '../core/project.js';

let modalEl = null;
let currentState = null;
let currentTab = 'single'; // 'single' | 'multiple'
let currentFormat = 'png'; // 'png' | 'jpeg' | 'bmp'
let selectedFrameIndices = [];

/**
 * Open the Save & Export Modal.
 */
export function openSaveModal(state, onSaveProject) {
  currentState = state;

  if (!modalEl) {
    buildModal();
  }

  // Trigger project save if callback provided
  if (onSaveProject) {
    onSaveProject();
  }

  // Reset selected frames (default all checked)
  const totalFrames = state.frames?.length || 1;
  selectedFrameIndices = Array.from({ length: totalFrames }, (_, i) => i);

  // Update timestamp
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
 * Close the Save & Export Modal.
 */
export function closeSaveModal() {
  if (modalEl) {
    modalEl.hidden = true;
  }
  document.body.classList.remove('is-modal-open');
}

/**
 * Construct modal DOM element once.
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
          <!-- Save As Options / Tabs -->
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

  // Event Listeners
  modalEl.querySelector('#save-modal-close')?.addEventListener('click', closeSaveModal);
  modalEl.querySelector('.save-modal__backdrop')?.addEventListener('click', closeSaveModal);

  // Keyboard Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalEl.hidden) {
      closeSaveModal();
    }
  });

  // Tab Hover & Click Navigation
  const tabs = modalEl.querySelectorAll('.save-modal__tab');
  tabs.forEach(tab => {
    const targetTab = tab.dataset.tab;
    // Hover event for instant inspection / tab switching
    tab.addEventListener('mouseenter', () => {
      currentTab = targetTab;
      updateTabUI();
      updatePreviews();
    });
    // Click event to lock selection
    tab.addEventListener('click', () => {
      currentTab = targetTab;
      updateTabUI();
      updatePreviews();
    });
  });

  // Format selector buttons (PNG, JPEG, BMP)
  const fmtBtns = modalEl.querySelectorAll('.save-modal__fmt-btn');
  fmtBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentFormat = btn.dataset.fmt;
      updateFormatUI();
      updatePreviews();
    });
  });

  // Scale & Frame dropdown changes
  modalEl.querySelector('#single-frame-select')?.addEventListener('change', updatePreviews);
  modalEl.querySelector('#single-scale-select')?.addEventListener('change', updatePreviews);
  modalEl.querySelector('#multi-scale-select')?.addEventListener('change', updatePreviews);

  // Select All Frames button
  modalEl.querySelector('#btn-frames-select-all')?.addEventListener('click', () => {
    const totalFrames = currentState.frames?.length || 1;
    selectedFrameIndices = Array.from({ length: totalFrames }, (_, i) => i);
    const checkboxes = modalEl.querySelectorAll('.multi-frame-cb');
    checkboxes.forEach(cb => { cb.checked = true; });
    updatePreviews();
  });

  // Export JSON project file
  modalEl.querySelector('#btn-modal-export-json')?.addEventListener('click', () => {
    if (!currentState) return;
    const jsonStr = JSON.stringify(serialise(currentState), null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = `pixelverse-project-${Date.now()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
  });

  // Single Frame Export action
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

  // Multi-frame Sprite Sheet Export action
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
 * Populate single-frame dropdown choices.
 */
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

/**
 * Populate multi-frame selection checklist.
 */
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

  // Render tiny thumbnails for each frame in the checklist
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

  // Attach checkbox toggle handlers
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

/**
 * Update UI for format selection buttons (PNG, JPEG, BMP).
 */
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

/**
 * Update active tab and visible panel.
 */
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

/**
 * Render canvas live previews.
 */
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

        // Draw checkerboard if transparent
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
    // Multi-frame Sprite Sheet Preview
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

/**
 * Draw background checkerboard pattern on preview canvas.
 */
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
