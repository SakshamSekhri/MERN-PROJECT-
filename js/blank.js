/**
 * PixelVerse — Blank Canvas entry point.
 */
import { initEditor } from './views/editor.js';
import { initStudio } from './views/studio.js';
import { go } from './core/router.js';

function boot() {
  initEditor();
  initStudio();
  go('editor');
}

document.addEventListener('DOMContentLoaded', boot);
