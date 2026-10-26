/**
 * PixelVerse — Blank Canvas entry point.
 */
import { initEditor } from './views/editor.js';
import { initStudio } from './views/studio.js';
import { go, onEnter } from './core/router.js';
import { playForgeTransition } from './views/forgeLoader.js';
import { SLOT_BLANK } from './core/project.js';
import { createOnboarding } from './views/onboarding.js';
import { editorTours, studioTour } from './views/tourContent.js';

function boot() {
  const params = new URLSearchParams(window.location.search);
  const slot = SLOT_BLANK;
  initEditor({ slot });
  initStudio();
  const guide = createOnboarding([...editorTours(), studioTour]);
  onEnter('editor', () => {
    guide.maybeStart(params.get('tour') === 'canvas-explore' ? 'canvas-explore' : 'canvas-basics');
  });
  onEnter('studio', () => guide.maybeStart('studio'));
  if (params.get('view') === 'studio' || window.location.hash === '#studio') {
    playForgeTransition(() => go('studio'));
  } else {
    go('editor');
  }
}

document.addEventListener('DOMContentLoaded', boot);
