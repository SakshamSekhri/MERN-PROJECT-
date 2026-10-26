/**
 * PixelVerse — Auto-Save, Resume Project & Exit Confirmation Modals.
 */

import { gridToCanvas } from '../animation/export.js';
import { loadProject, describeAge } from '../core/project.js';
import { formatBytes } from '../core/codec.js';

let resumeModalEl = null;
let exitModalEl = null;

/**
 * Open the "Resume Previous Project" modal screen on page reload/open.
 */
export function openResumeProjectModal({ peek, slot = 'project', onRestore, onDismiss }) {
  if (!peek) return;

  if (!resumeModalEl) {
    buildResumeModal();
  }

  const isImageMode = slot === 'project_image';

  // Subtitle
  const subEl = resumeModalEl.querySelector('#resume-modal-sub');
  if (subEl) {
    subEl.textContent = isImageMode
      ? 'A saved Create-from-Image project was found on this device'
      : 'A saved Start-Creating project was found on this device';
  }

  // Description
  const descEl = resumeModalEl.querySelector('#resume-description');
  if (descEl) {
    descEl.textContent = isImageMode
      ? 'Would you like to continue working on your image reference artwork or start a new reference project?'
      : 'Would you like to continue working on your saved artwork or start a new blank canvas?';
  }

  // New Button Label
  const newLabelEl = resumeModalEl.querySelector('#btn-resume-new-label');
  if (newLabelEl) {
    newLabelEl.textContent = isImageMode ? 'Start New Reference Project' : 'Start New Blank Canvas';
  }

  // Populate metadata
  const metaEl = resumeModalEl.querySelector('#resume-meta-info');
  if (metaEl) {
    metaEl.textContent = `${peek.frames} frame${peek.frames === 1 ? '' : 's'} · ${peek.gridSize}×${peek.gridSize} grid · saved ${describeAge(peek.savedAt)} (${formatBytes(peek.bytes)})`;
  }

  // Render preview canvas from saved data
  const previewCanvas = resumeModalEl.querySelector('#resume-preview-canvas');
  if (previewCanvas) {
    const savedData = loadProject(slot);
    if (savedData && savedData.frames && savedData.frames[0]) {
      const activeFrame = savedData.frames[savedData.activeFrame] || savedData.frames[0];
      const fc = gridToCanvas(activeFrame.grid, 6, { background: 'transparent' });
      const ctx = previewCanvas.getContext('2d');
      ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      ctx.imageSmoothingEnabled = false;

      // Draw background checkerboard
      drawCheckerboard(ctx, previewCanvas.width, previewCanvas.height);

      if (fc) {
        ctx.drawImage(fc, 0, 0, previewCanvas.width, previewCanvas.height);
      }
    }
  }

  // Wire buttons
  const btnContinue = resumeModalEl.querySelector('#btn-resume-continue');
  const btnNew = resumeModalEl.querySelector('#btn-resume-new');
  const closeBtn = resumeModalEl.querySelector('#resume-modal-close');
  const backdrop = resumeModalEl.querySelector('.save-modal__backdrop');

  const handleContinue = () => {
    closeResumeModal();
    if (onRestore) onRestore();
  };

  const handleNew = () => {
    closeResumeModal();
    if (onDismiss) onDismiss();
  };

  // Replace listeners cleanly
  const newBtnContinue = btnContinue.cloneNode(true);
  const newBtnNew = btnNew.cloneNode(true);
  btnContinue.parentNode.replaceChild(newBtnContinue, btnContinue);
  btnNew.parentNode.replaceChild(newBtnNew, btnNew);

  newBtnContinue.addEventListener('click', handleContinue);
  newBtnNew.addEventListener('click', handleNew);

  // Closing a restore prompt must never silently delete the saved artwork.
  // The artist explicitly chooses Continue or Start New.
  if (closeBtn) closeBtn.hidden = true;
  if (backdrop) backdrop.onclick = null;

  resumeModalEl.hidden = false;
  document.body.classList.add('is-modal-open');
}

/**
 * Close Resume Project Modal.
 */
export function closeResumeModal() {
  if (resumeModalEl) {
    resumeModalEl.hidden = true;
  }
  document.body.classList.remove('is-modal-open');
}

/**
 * Open Exit Confirmation Modal when leaving or clicking back.
 */
export function openExitConfirmModal({ onSaveAndExit, onExitWithoutSave, onCancel }) {
  if (!exitModalEl) {
    buildExitModal();
  }

  const btnSaveExit = exitModalEl.querySelector('#btn-exit-save');
  const btnNoSaveExit = exitModalEl.querySelector('#btn-exit-nosave');
  const btnCancelExit = exitModalEl.querySelector('#btn-exit-cancel');
  const closeBtn = exitModalEl.querySelector('#exit-modal-close');
  const backdrop = exitModalEl.querySelector('.save-modal__backdrop');

  const handleSaveExit = () => {
    closeExitModal();
    if (onSaveAndExit) onSaveAndExit();
  };

  const handleNoSaveExit = () => {
    closeExitModal();
    if (onExitWithoutSave) onExitWithoutSave();
  };

  const handleCancel = () => {
    closeExitModal();
    if (onCancel) onCancel();
  };

  // Replace event listeners cleanly
  const newBtnSaveExit = btnSaveExit.cloneNode(true);
  const newBtnNoSaveExit = btnNoSaveExit.cloneNode(true);
  const newBtnCancelExit = btnCancelExit.cloneNode(true);
  btnSaveExit.parentNode.replaceChild(newBtnSaveExit, btnSaveExit);
  btnNoSaveExit.parentNode.replaceChild(newBtnNoSaveExit, btnNoSaveExit);
  btnCancelExit.parentNode.replaceChild(newBtnCancelExit, btnCancelExit);

  newBtnSaveExit.addEventListener('click', handleSaveExit);
  newBtnNoSaveExit.addEventListener('click', handleNoSaveExit);
  newBtnCancelExit.addEventListener('click', handleCancel);
  if (closeBtn) closeBtn.onclick = handleCancel;
  if (backdrop) backdrop.onclick = handleCancel;

  exitModalEl.hidden = false;
  document.body.classList.add('is-modal-open');
}

/**
 * Close Exit Confirmation Modal.
 */
export function closeExitModal() {
  if (exitModalEl) {
    exitModalEl.hidden = true;
  }
  document.body.classList.remove('is-modal-open');
}

/**
 * Construct Resume Project Modal DOM.
 */
function buildResumeModal() {
  resumeModalEl = document.createElement('div');
  resumeModalEl.className = 'save-modal';
  resumeModalEl.id = 'resume-project-modal';
  resumeModalEl.hidden = true;

  resumeModalEl.innerHTML = `
    <div class="save-modal__backdrop"></div>
    <div class="save-modal__sheet save-modal__sheet--medium">
      <div class="save-modal__head">
        <div class="save-modal__title-group">
          <h2 class="save-modal__title">RESUME PREVIOUS PROJECT</h2>
          <span class="save-modal__sub" id="resume-modal-sub">A saved pixel art project was found on this device</span>
        </div>
        <button class="save-modal__close" id="resume-modal-close" title="Close">×</button>
      </div>

      <div class="save-modal__section">
        <div class="save-modal__panel">
          <div class="save-modal__panel-layout">
            <div class="save-modal__panel-opts">
              <div class="save-modal__status-card" style="margin-bottom: var(--s3);">
                <div class="save-modal__status-info">
                  <span class="save-modal__status-icon">🎨</span>
                  <div>
                    <strong class="save-modal__status-label">Saved Project Ready</strong>
                    <span class="save-modal__status-time" id="resume-meta-info">Saved project details</span>
                  </div>
                </div>
              </div>

              <p style="font-family: var(--font-mono); font-size: 11px; color: var(--ink-dim); line-height: 1.5; margin-bottom: var(--s3);" id="resume-description">
                Would you like to continue working on your saved artwork or start a new blank canvas?
              </p>

              <div style="display: flex; flex-direction: column; gap: var(--s2);">
                <button class="btn btn--gold btn--wide" id="btn-resume-continue">
                  <span>Continue Saved Project</span>
                  <span>→</span>
                </button>
                <button class="btn btn--ghost btn--wide" id="btn-resume-new">
                  <span id="btn-resume-new-label">Start New Blank Canvas</span>
                </button>
              </div>
            </div>

            <div class="save-modal__preview-box">
              <span class="save-modal__preview-label">Saved Artwork</span>
              <canvas class="save-modal__preview-canvas" id="resume-preview-canvas" width="180" height="180"></canvas>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(resumeModalEl);
}

/**
 * Construct Exit Confirmation Modal DOM.
 */
function buildExitModal() {
  exitModalEl = document.createElement('div');
  exitModalEl.className = 'save-modal';
  exitModalEl.id = 'exit-confirm-modal';
  exitModalEl.hidden = true;

  exitModalEl.innerHTML = `
    <div class="save-modal__backdrop"></div>
    <div class="save-modal__sheet save-modal__sheet--small">
      <div class="save-modal__head">
        <div class="save-modal__title-group">
          <h2 class="save-modal__title" style="color: var(--gold);">SAVE BEFORE LEAVING?</h2>
          <span class="save-modal__sub">You are about to exit the editor</span>
        </div>
        <button class="save-modal__close" id="exit-modal-close" title="Close">×</button>
      </div>

      <div class="save-modal__section">
        <div class="save-modal__panel" style="padding: var(--s4);">
          <p style="font-family: var(--font-mono); font-size: 11px; color: var(--ink); line-height: 1.5; margin-bottom: var(--s4);">
            Do you want to save your project state so you can continue when you return?
          </p>

          <div style="display: flex; flex-direction: column; gap: var(--s2);">
            <button class="btn btn--gold btn--wide" id="btn-exit-save">
              <span>Save & Exit</span>
              <span>💾</span>
            </button>
            <button class="btn btn--danger btn--wide" id="btn-exit-nosave">
              <span>Exit Without Saving</span>
            </button>
            <button class="btn btn--ghost btn--wide" id="btn-exit-cancel">
              <span>Cancel (Stay Here)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(exitModalEl);
}

/**
 * Draw background checkerboard pattern on canvas.
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
