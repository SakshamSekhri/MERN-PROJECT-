/**
 * PixelVerse — Create from Image entry point.
 */
import { initReference } from './views/reference.js';
import { initEditor } from './views/editor.js';
import { go, onEnter } from './core/router.js';
import { SLOT_IMAGE } from './core/project.js';
import { createOnboarding } from './views/onboarding.js';
import { editorTours, referenceTours } from './views/tourContent.js';

function boot() {
  initReference();
  initEditor({ slot: SLOT_IMAGE });
  const guide = createOnboarding([...referenceTours, ...editorTours({ image: true })]);
  const workspace = document.getElementById('ref-workspace');
  onEnter('reference', () => guide.maybeStart(workspace.hidden ? 'reference-upload' : 'reference-settings'));
  onEnter('editor', () => guide.maybeStart(new URLSearchParams(location.search).get('tour') === 'image-explore'
    ? 'image-explore' : 'image-editor'));
  new MutationObserver(() => {
    if (!workspace.hidden && document.getElementById('view-reference').classList.contains('is-active'))
      guide.maybeStart('reference-settings');
  }).observe(workspace, { attributes: true, attributeFilter: ['hidden'] });
  go('reference');
}

document.addEventListener('DOMContentLoaded', boot);
