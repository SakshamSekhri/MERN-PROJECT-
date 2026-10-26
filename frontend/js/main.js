/**
 * PixelVerse — Landing page entry point.
 */
import { initLanding } from './views/landing.js';
import { go } from './core/router.js';

function boot() {
  initLanding();
  go('landing');
}

document.addEventListener('DOMContentLoaded', boot);