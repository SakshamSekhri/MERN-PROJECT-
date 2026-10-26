import { accountReady, accountRequest, currentAccount, openAccount } from './accountModal.js';

let modal;
function close() { if (modal) { modal.hidden = true; document.body.classList.remove('is-modal-open'); } }

export async function openPublish(source) {
  await accountReady;
  if (!currentAccount()) { openAccount(); return; }
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'pv-account';
    modal.hidden = true;
    modal.innerHTML = `<div class="pv-account__backdrop"></div><section class="pv-account__dialog" role="dialog" aria-modal="true" aria-label="Publish artwork">
      <header><span>PIXELVERSE / PUBLISH</span><button type="button" class="btn btn--ghost pv-account__close" aria-label="Close publish">×</button></header>
      <p class="pv-account__status" role="status" hidden></p><div class="pv-account__content">
      <p class="pv-account__hint">Publishing creates a fixed copy. Later canvas edits will not alter this post.</p>
      <form class="pv-account__form"><label class="pv-account__field"><span>Title</span><input name="title" maxlength="120" required /></label>
      <label class="pv-account__field"><span>Description</span><textarea name="description" maxlength="2000" rows="4"></textarea></label>
      <label class="pv-account__field"><span>Tags · up to five, separated by commas</span><input name="tags" maxlength="150" placeholder="pixel-art, fantasy, animation" /></label>
      <label class="pv-account__field"><span>Visibility</span><select name="visibility"><option value="public">Public gallery</option><option value="unlisted">Unlisted link</option><option value="private">Private</option></select></label>
      <button class="btn btn--sun" type="submit">Publish fixed copy</button></form></div></section>`;
    document.body.append(modal);
    modal.querySelector('.pv-account__close').addEventListener('click', close);
    modal.querySelector('.pv-account__backdrop').addEventListener('click', close);
    window.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });
  }
  const form = modal.querySelector('form');
  form.elements.title.value = source.title || 'Untitled artwork';
  form.elements.description.value = '';
  form.elements.tags.value = '';
  form.elements.visibility.value = 'public';
  const status = modal.querySelector('.pv-account__status');
  status.hidden = true;
  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    status.hidden = false;
    status.textContent = 'Publishing…';
    try {
      const project = source.getProject?.();
      const result = await accountRequest('/gallery', { method: 'POST', body: JSON.stringify({
        title: form.elements.title.value, description: form.elements.description.value,
        tags: form.elements.tags.value.split(',').map(tag => tag.trim()).filter(Boolean),
        visibility: form.elements.visibility.value,
        project,
      }) });
      close();
      location.assign(`gallery.html?art=${encodeURIComponent(result.artwork.id)}`);
    } catch (error) { status.textContent = error.message; submit.disabled = false; }
  };
  modal.hidden = false;
  document.body.classList.add('is-modal-open');
  form.elements.title.focus();
}
