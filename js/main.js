/**
 * PixelVerse — application entry point.
 *
 * Boots every view once, then hands navigation to the router. Views stay
 * mounted in the DOM so in-memory state survives switching between them.
 */
import { initReference } from './views/reference.js';   // add to imports
import { initStudio } from './views/studio.js';   // add to imports
import { initLanding } from './views/landing.js';
import { initEditor } from './views/editor.js';
import { go } from './core/router.js';

function boot() {
  initLanding();
  initEditor();
  initStudio();  
  initReference();                                       // add after initStudio();                                  // add after initEditor();
  go('landing');
}

document.addEventListener('DOMContentLoaded', boot);