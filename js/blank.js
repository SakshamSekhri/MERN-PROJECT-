/**
 * PixelVerse — Blank Canvas entry point.
 */
import { initEditor } from './views/editor.js';
import { initStudio } from './views/studio.js';
import { go } from './core/router.js';
import { playForgeTransition } from './views/forgeLoader.js';
import { SLOT_BLANK } from './core/project.js';

function boot() {
  initEditor({ slot: SLOT_BLANK });
  initStudio();
  const params = new URLSearchParams(window.location.search);
  if (params.get('view') === 'studio' || window.location.hash === '#studio') {
    playForgeTransition(() => go('studio'));
  } else {
    go('editor');
  }
}

document.addEventListener('DOMContentLoaded', boot);
