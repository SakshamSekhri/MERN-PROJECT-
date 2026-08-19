/**
 * PixelVerse — Create from Image entry point.
 */
import { initReference } from './views/reference.js';
import { initEditor } from './views/editor.js';
import { go } from './core/router.js';

function boot() {
  initReference();
  initEditor();
  go('reference');
}

document.addEventListener('DOMContentLoaded', boot);
