/**
 * Frame timeline strip.
 *
 * Renders one thumbnail per frame, handles selection and drag-to-reorder.
 * It owns no frame data — it reads the array it is given and calls back to
 * the editor when the user does something. The Animation Studio reuses this
 * same component in Milestone 4.
 */

import { drawThumbnail } from '../canvas/renderer.js';

const THUMB_PX = 48;

/**
 * @param {HTMLElement} root      container to render into
 * @param {object} handlers       { onSelect, onReorder, onDelete, onDuplicate }
 */
export class Timeline {
  constructor(root, handlers = {}) {
    this.root = root;
    this.handlers = handlers;
    this.dragFrom = null;
  }

  render(frames, activeIndex) {
    this.root.innerHTML = '';

    frames.forEach((frame, i) => {
      const item = document.createElement('div');
      item.className = 'frame-item' + (i === activeIndex ? ' is-active' : '');
      item.draggable = true;
      item.dataset.index = i;

      const canvas = document.createElement('canvas');
      canvas.width = THUMB_PX;
      canvas.height = THUMB_PX;
      canvas.className = 'frame-item__thumb';
      drawThumbnail(canvas, frame.grid);

      const label = document.createElement('span');
      label.className = 'frame-item__no';
      label.textContent = String(i + 1).padStart(2, '0');

      item.append(canvas, label);

      // ── selection ──
      item.addEventListener('click', () => this.handlers.onSelect?.(i));

      // ── drag to reorder ──
      item.addEventListener('dragstart', e => {
        this.dragFrom = i;
        item.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Firefox needs data set or the drag never starts
        e.dataTransfer.setData('text/plain', String(i));
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('is-dragging');
        this.dragFrom = null;
        this.root.querySelectorAll('.frame-item').forEach(el => el.classList.remove('is-over'));
      });

      item.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this.dragFrom !== null && this.dragFrom !== i) item.classList.add('is-over');
      });

      item.addEventListener('dragleave', () => item.classList.remove('is-over'));

      item.addEventListener('drop', e => {
        e.preventDefault();
        item.classList.remove('is-over');
        const from = this.dragFrom ?? Number(e.dataTransfer.getData('text/plain'));
        if (from !== null && !Number.isNaN(from) && from !== i) {
          this.handlers.onReorder?.(from, i);
        }
      });

      this.root.appendChild(item);
    });
  }
}