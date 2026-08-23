/**
 * PixelVerse — Create from Image entry point.
 */
import { initReference } from './views/reference.js';
import { initEditor } from './views/editor.js';
import { go } from './core/router.js';
import { SLOT_IMAGE } from './core/project.js';

function boot() {
  initReference();
  initEditor({ slot: SLOT_IMAGE });
  go('reference');
}

document.addEventListener('DOMContentLoaded', boot);
