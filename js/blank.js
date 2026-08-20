/**
 * PixelVerse — Blank Canvas entry point.
 */
import { initEditor } from './views/editor.js';
import { initStudio } from './views/studio.js';
import { go } from './core/router.js';

function boot() {
  initEditor();
  initStudio();
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'studio' || window.location.hash === '#studio') {
    go('studio');
  } else {
    go('editor');
  }
}

document.addEventListener('DOMContentLoaded', boot);
