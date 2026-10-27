/** Account controls for the original PixelVerse editor. Access tokens stay in memory. */
import { deserialise, serialise } from '../core/project.js';
import { apiBase } from '../core/apiBase.js';

let accessToken = null;
let user = null;
let config = { googleClientId: null, emailRegistration: false };
let projects = [];
let selectedId = null;
let title = 'Untitled artwork';
let mode = 'login';
let intent = 'account';
let busy = false;
let message = '';
let modal;
let content;
let status;
let callbacks;
let galleryOnly = false;
let googleScript;
let returnFocus = null;
let importDraft = null;
let resolveAccountReady;
export const accountReady = new Promise(resolve => { resolveAccountReady = resolve; });
const googleBridgeOrigin = 'http://localhost:5173';

async function readResponse(response) {
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status})`), { status: response.status });
  return data;
}

async function refresh() {
  const perform = async () => {
    const response = await fetch(`${apiBase}/auth/refresh`, { method: 'POST', credentials: 'include' });
    const data = await readResponse(response);
    accessToken = data.accessToken;
    user = data.user;
    return accessToken;
  };
  return navigator.locks?.request
    ? navigator.locks.request('pixelverse-auth-refresh', perform)
    : perform();
}

async function request(path, options = {}) {
  const send = token => fetch(`${apiBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  try {
    let response = await send(accessToken);
    if (response.status === 401 && (path.startsWith('/projects') || path.startsWith('/gallery') || path === '/auth/logout')) {
      try { response = await send(await refresh()); }
      catch { accessToken = null; user = null; throw new Error('Session expired. Sign in again.'); }
    }
    return await readResponse(response);
  } catch (error) {
    if (error instanceof TypeError) throw new Error('Cannot reach the PixelVerse API. Start the API and try again.');
    throw error;
  }
}
export const accountRequest = request;
export function currentAccount() { return user; }

function setMessage(value) {
  message = value;
  if (status) {
    status.textContent = value;
    status.hidden = !value;
  }
}

async function run(action) {
  if (busy) return;
  busy = true;
  content?.querySelectorAll('button').forEach(button => { button.disabled = true; });
  setMessage('');
  try { await action(); }
  catch (error) { setMessage(error.message || 'Something went wrong.'); }
  finally { busy = false; render(); }
}

function makeInput(label, name, type = 'text', extra = '') {
  return `<label class="pv-account__field"><span>${label}</span><input name="${name}" type="${type}" ${extra} required /></label>`;
}

function renderSignedOut() {
  const heading = mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Recover password'
    : mode === 'reset' ? 'New password' : mode === 'verify' ? 'Verify email'
      : mode === 'transfer' ? 'Finishing Google sign-in' : 'Sign in';
  content.innerHTML = `
    <h3>${heading}</h3>
    ${mode === 'verify' || mode === 'transfer' ? '<p>Please wait…</p>' : `
      <form id="pv-account-form" class="pv-account__form">
        ${mode === 'register' ? makeInput('Display name', 'name', 'text', 'minlength="2" maxlength="80" autocomplete="name"') : ''}
        ${mode !== 'reset' ? makeInput('Email', 'email', 'email', 'autocomplete="email"') : ''}
        ${mode !== 'forgot' ? makeInput('Password', 'password', 'password', `autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" ${mode === 'login' ? '' : 'minlength="12"'}`) : ''}
        <button class="btn btn--lime btn--wide" type="submit" ${mode === 'register' && !config.emailRegistration ? 'disabled' : ''}>${mode === 'register' ? 'Sign up' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Reset password' : 'Sign in'}</button>
      </form>`}
    <div class="pv-account__links">
      ${mode === 'login' ? '<button class="btn btn--ghost btn--sm" data-mode="register">Sign up</button><button class="btn btn--ghost btn--sm" data-mode="forgot">Forgot password?</button>' : '<button class="btn btn--ghost btn--sm" data-mode="login">Back to sign in</button>'}
    </div>
    ${mode === 'register' && !config.emailRegistration ? '<p class="pv-account__hint">Email registration is unavailable until the API email sender is configured.</p>' : ''}
    ${config.googleClientId && !['reset', 'verify', 'transfer'].includes(mode) ? '<div class="pv-account__google"><span>or continue with Google</span><div id="pv-google-button"></div></div>' : ''}
  `;
  content.querySelector('#pv-account-form')?.addEventListener('submit', submitForm);
  content.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
    mode = button.dataset.mode;
    setMessage('');
    render();
  }));
  renderGoogle();
}

function projectButton(project) {
  const row = document.createElement('div');
  row.className = 'pv-account__project-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost pv-account__project';
  const name = document.createElement('strong');
  name.textContent = project.title;
  const details = document.createElement('small');
  details.textContent = `${project.frames} frame${project.frames === 1 ? '' : 's'} · ${project.gridSize} × ${project.gridSize}`;
  button.append(name, details);
  button.addEventListener('click', () => run(async () => {
    const result = await request(`/projects/${encodeURIComponent(project.id)}`);
    await callbacks.openProject(result.project.data);
    selectedId = project.id;
    title = project.title;
    setMessage('Cloud project opened. Your previous local work has a separate backup.');
  }));
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn--ghost pv-account__project-delete';
  remove.textContent = '×';
  remove.title = 'Delete from cloud';
  remove.setAttribute('aria-label', `Delete ${project.title} from cloud`);
  remove.addEventListener('click', () => {
    if (!confirm(`Delete “${project.title}” from your cloud projects? This cannot be undone. Your current canvas will stay open.`)) return;
    void run(async () => {
      await request(`/projects/${encodeURIComponent(project.id)}`, { method: 'DELETE' });
      if (selectedId === project.id) selectedId = null;
      await loadProjects();
      setMessage('Cloud project deleted. Your current canvas is unchanged.');
    });
  });
  row.append(button, remove);
  return row;
}

function renderSignedIn() {
  const googleSection = !config.googleClientId ? '' : user.googleLinked
    ? '<div class="pv-account__google"><span>Google sign-in connected</span></div>'
    : '<div class="pv-account__google"><span>Connect Google sign-in to this account</span><div id="pv-google-button"></div></div>';
  if (galleryOnly) {
    content.innerHTML = `<h3>Your account</h3><p class="pv-account__identity"><strong></strong><span></span></p>
      <div class="pv-account__actions"><button class="btn btn--cyan" id="pv-open-profile">View my profile</button><button class="btn btn--ghost" id="pv-password-email">Set or reset password</button><button class="btn btn--danger" id="pv-logout">Sign out</button></div>
      ${googleSection}`;
    content.querySelector('.pv-account__identity strong').textContent = user.displayName;
    content.querySelector('.pv-account__identity span').textContent = user.email;
    content.querySelector('#pv-open-profile').addEventListener('click', () => location.assign(`gallery.html?artist=${encodeURIComponent(user.id)}`));
    content.querySelector('#pv-password-email').addEventListener('click', () => run(async () => {
      const result = await request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: user.email }) });
      setMessage(result.message);
    }));
    content.querySelector('#pv-logout').addEventListener('click', () => run(async () => {
      try { await request('/auth/logout', { method: 'POST' }); }
      finally { accessToken = null; user = null; projects = []; selectedId = null; importDraft = null; }
      mode = 'login'; setMessage('Signed out.');
    }));
    renderGoogle();
    return;
  }
  const projectScroll = content.querySelector('#pv-project-list')?.scrollTop ?? 0;
  const recoveryScroll = content.querySelector('#pv-recovery-list')?.scrollTop ?? 0;
  content.innerHTML = `
    <h3>Your account</h3>
    <p class="pv-account__identity"><strong></strong><span></span></p>
    <label class="pv-account__field"><span>Project title</span><input id="pv-project-title" maxlength="120" /></label>
    <div class="pv-account__actions"><button class="btn btn--lime" id="pv-cloud-save">${selectedId ? 'Save changes to cloud' : 'Save to cloud'}</button><button class="btn btn--ghost" id="pv-cloud-new">Save as new</button></div>
    <h3>Bring an older project</h3>
    <div class="pv-account__actions"><button class="btn btn--ghost" type="button" id="pv-import-pick">Choose project .json</button><input id="pv-import-file" type="file" accept=".json,application/json" hidden /></div>
    <div id="pv-import-preview" class="pv-account__identity" ${importDraft ? '' : 'hidden'}></div>
    <h3 id="pv-project-heading">Your cloud projects <span class="pv-account__count" id="pv-project-count"></span></h3>
    <div id="pv-project-list" class="pv-account__list" role="region" aria-labelledby="pv-project-heading"></div>
    <h3 id="pv-recovery-heading">Local recovery copies <span class="pv-account__count" id="pv-recovery-count"></span></h3>
    <div id="pv-recovery-list" class="pv-account__list" role="region" aria-labelledby="pv-recovery-heading"></div>
    <div class="pv-account__actions"><button class="btn btn--cyan" id="pv-open-profile">View my profile</button><button class="btn btn--ghost" id="pv-password-email">Set or reset password</button><button class="btn btn--danger" id="pv-logout">Sign out</button></div>
    ${googleSection}
  `;
  content.querySelector('.pv-account__identity strong').textContent = user.displayName;
  content.querySelector('.pv-account__identity span').textContent = user.email;
  content.querySelector('#pv-open-profile').addEventListener('click', () => run(async () => {
    callbacks.saveLocal();
    location.assign(`gallery.html?artist=${encodeURIComponent(user.id)}`);
  }));
  const titleInput = content.querySelector('#pv-project-title');
  titleInput.value = title;
  titleInput.addEventListener('input', () => { title = titleInput.value; });
  content.querySelector('#pv-cloud-save').addEventListener('click', () => run(async () => {
    if (!title.trim()) throw new Error('Enter a project title.');
    callbacks.saveLocal();
    const data = await request(selectedId ? `/projects/${selectedId}` : '/projects', {
      method: selectedId ? 'PUT' : 'POST',
      body: JSON.stringify({ title: title.trim(), project: callbacks.getProject() }),
    });
    selectedId = data.project.id;
    await loadProjects();
    setMessage('Saved to your account. Your browser copy is also kept.');
  }));
  content.querySelector('#pv-cloud-new').addEventListener('click', () => {
    selectedId = null;
    title = 'Untitled artwork';
    render();
  });
  content.querySelector('#pv-import-pick').addEventListener('click', () => content.querySelector('#pv-import-file').click());
  content.querySelector('#pv-import-file').addEventListener('change', event => run(async () => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4_000_000) throw new Error('Project file is too large for cloud import (4 MB maximum).');
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { throw new Error('Project file is not valid JSON.'); }
    if (![1, 2].includes(data?.v) || !Array.isArray(data.frames))
      throw new Error('This is not a supported PixelVerse project file.');
    const restored = deserialise(data);
    if (!restored || restored.frames.length !== data.frames.length || ![16, 32, 64, 128].includes(restored.gridSize))
      throw new Error('Project has unreadable frames or an unsupported grid size.');
    const project = serialise(restored);
    importDraft = { project, title: file.name.replace(/\.json$/i, '').slice(0, 120) || 'Imported artwork',
      frames: project.frames.length, gridSize: project.gridSize,
      history: Boolean(project.journal?.x?.length || project.journal?.entries?.length) };
    setMessage('Review the project below, then import it into your account. Your current canvas stays open.');
  }));
  if (importDraft) {
    const preview = content.querySelector('#pv-import-preview');
    const details = document.createElement('span');
    details.textContent = `${importDraft.frames} frame${importDraft.frames === 1 ? '' : 's'} · ${importDraft.gridSize} × ${importDraft.gridSize} · Replay ${importDraft.history ? 'included' : 'unavailable'}`;
    const name = document.createElement('input');
    name.value = importDraft.title;
    name.maxLength = 120;
    name.setAttribute('aria-label', 'Imported project title');
    name.addEventListener('input', () => { importDraft.title = name.value; });
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'btn btn--lime';
    confirm.textContent = 'Import to cloud';
    confirm.addEventListener('click', () => run(async () => {
      if (!importDraft.title.trim()) throw new Error('Enter a project title.');
      await request('/projects', { method: 'POST', body: JSON.stringify({
        title: importDraft.title.trim(), project: importDraft.project,
      }) });
      importDraft = null;
      await loadProjects();
      setMessage('Project imported. Open it from the cloud list when ready; your current canvas is unchanged.');
    }));
    preview.append(details, name, confirm);
  }
  const list = content.querySelector('#pv-project-list');
  if (projects.length) projects.forEach(project => list.appendChild(projectButton(project)));
  else list.textContent = 'No cloud projects yet.';
  content.querySelector('#pv-project-count').textContent = `(${projects.length})`;
  list.classList.toggle('is-scrollable', projects.length > 3);
  if (projects.length > 3) list.tabIndex = 0;
  list.scrollTop = projectScroll;
  const recoveryList = content.querySelector('#pv-recovery-list');
  const recoveries = callbacks.listBackups?.() ?? [];
  if (!recoveries.length) recoveryList.textContent = 'No recovery copies yet. Opening a cloud project creates one here.';
  recoveries.forEach(copy => {
    const row = document.createElement('div');
    row.className = 'pv-account__project-row';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--ghost pv-account__project';
    const label = document.createElement('strong');
    label.textContent = `Restore ${copy.frames} frame${copy.frames === 1 ? '' : 's'} · ${copy.gridSize} × ${copy.gridSize}`;
    const date = document.createElement('small');
    date.textContent = copy.savedAt ? new Date(copy.savedAt).toLocaleString() : 'Earlier local copy';
    button.append(label, date);
    button.addEventListener('click', () => run(async () => {
      await callbacks.restoreBackup(copy.slot);
      selectedId = null;
      title = 'Untitled artwork';
      setMessage('Local copy restored. The canvas it replaced also has a recovery copy.');
    }));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--ghost pv-account__project-delete';
    remove.textContent = '×';
    remove.title = 'Delete local recovery copy';
    remove.setAttribute('aria-label', `Delete local recovery copy from ${date.textContent}`);
    remove.addEventListener('click', () => {
      if (!confirm('Delete this local recovery copy from this browser? This cannot be undone. Your current canvas and cloud projects will stay.')) return;
      void run(async () => {
        callbacks.deleteBackup(copy.slot);
        setMessage('Local recovery copy deleted. Your current canvas and cloud projects are unchanged.');
      });
    });
    row.append(button, remove);
    recoveryList.appendChild(row);
  });
  content.querySelector('#pv-recovery-count').textContent = `(${recoveries.length})`;
  recoveryList.classList.toggle('is-scrollable', recoveries.length > 3);
  if (recoveries.length > 3) recoveryList.tabIndex = 0;
  recoveryList.scrollTop = recoveryScroll;
  content.querySelector('#pv-password-email').addEventListener('click', () => run(async () => {
    const result = await request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: user.email }) });
    setMessage(result.message);
  }));
  content.querySelector('#pv-logout').addEventListener('click', () => run(async () => {
    await callbacks.beforeSignOut?.();
    try { await request('/auth/logout', { method: 'POST' }); }
    finally { accessToken = null; user = null; projects = []; selectedId = null; importDraft = null; }
    mode = 'login';
    setMessage('Signed out. Your drawing stays in this browser.');
  }));
  renderGoogle();
}

function render() {
  if (!modal || modal.hidden) return;
  if (user) renderSignedIn(); else renderSignedOut();
  setMessage(message);
  document.querySelectorAll('[data-account-open]').forEach(button => {
    button.textContent = user ? 'Account' : 'Account';
    button.title = user ? `Signed in as ${user.displayName}` : 'Sign in or create an account';
  });
  window.dispatchEvent(new CustomEvent('pixelverse:account', { detail: { user } }));
}

async function submitForm(event) {
  event.preventDefault();
  const values = new FormData(event.currentTarget);
  const email = String(values.get('email') || '');
  const password = String(values.get('password') || '');
  await run(async () => {
    if (mode === 'register') {
      const result = await request('/auth/register', { method: 'POST', body: JSON.stringify({ displayName: values.get('name'), email, password }) });
      mode = 'login'; setMessage(result.message);
    } else if (mode === 'forgot') {
      const result = await request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      mode = 'login'; setMessage(result.message);
    } else if (mode === 'reset') {
      const token = decodeURIComponent(location.hash.slice('#reset='.length));
      const result = await request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      history.replaceState(null, '', location.pathname + location.search);
      mode = 'login'; setMessage(result.message);
    } else {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      accessToken = data.accessToken; user = data.user;
      selectedId = null;
      if (!galleryOnly) await loadProjects();
      setMessage(`Welcome, ${user.displayName}.`);
    }
  });
}

async function loadProjects() {
  const data = await request('/projects');
  projects = data.projects;
}

function renderGoogle() {
  const host = content?.querySelector('#pv-google-button');
  if (!host || !config.googleClientId) return;
  const lanAddress = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d+\.\d+\.\d+$/.test(location.hostname);
  if (lanAddress) {
    host.textContent = 'Use email sign-in on this local network. Google sign-in needs an authorized site address.';
    return;
  }
  if (location.origin !== googleBridgeOrigin && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--ghost';
    button.textContent = user ? 'Link with Google' : 'Sign in with Google';
    button.addEventListener('click', () => run(async () => {
      try {
        callbacks.saveLocal();
        const returnUrl = `${location.origin}${location.pathname}${location.search}`;
        const linkCode = user ? (await request('/auth/google-link-intent', { method: 'POST' })).code : null;
        const bridgeUrl = `${googleBridgeOrigin}/google-bridge.html?returnUrl=${encodeURIComponent(returnUrl)}`;
        location.assign(linkCode ? `${bridgeUrl}#link-intent=${encodeURIComponent(linkCode)}` : bridgeUrl);
      } catch (error) { setMessage(error.message); }
    }));
    host.replaceChildren(button);
    return;
  }
  const draw = () => {
    if (!host.isConnected || !window.google?.accounts?.id) return;
    host.replaceChildren();
    window.google.accounts.id.initialize({ client_id: config.googleClientId, use_fedcm_for_button: true, callback: ({ credential }) => run(async () => {
      if (user) {
        const data = await request('/auth/link-google', { method: 'POST', body: JSON.stringify({ credential }) });
        user = data.user;
        setMessage('Google account linked.');
      } else {
        const data = await request('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) });
        accessToken = data.accessToken; user = data.user; selectedId = null;
        if (!galleryOnly) await loadProjects();
        setMessage(`Welcome, ${user.displayName}.`);
      }
    }) });
    window.google.accounts.id.renderButton(host, { theme: 'filled_black', size: 'large', width: 260,
      click_listener: () => {
        const promptMessage = 'Choose your Google account in the browser prompt.';
        setMessage(promptMessage);
        setTimeout(() => {
          if (!user && message === promptMessage)
            setMessage('No Google prompt appeared? Allow Google sign-in prompts for this site, or try Chrome or Edge.');
        }, 12000);
      },
    });
  };
  if (window.google?.accounts?.id) { draw(); return; }
  if (!googleScript) {
    googleScript = document.createElement('script');
    googleScript.src = 'https://accounts.google.com/gsi/client';
    googleScript.async = true;
    document.head.appendChild(googleScript);
  }
  googleScript.addEventListener('load', draw, { once: true });
}

export function closeAccount() {
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('is-modal-open');
  if (returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

export function openAccount(nextIntent = 'account') {
  if (modal.hidden) returnFocus = document.activeElement;
  intent = nextIntent;
  modal.hidden = false;
  document.body.classList.add('is-modal-open');
  render();
  if (user && !galleryOnly) loadProjects().then(render).catch(error => setMessage(error.message));
  modal.querySelector('.pv-account__close').focus();
}

export function forgetCloudProject() {
  selectedId = null;
  title = 'Untitled artwork';
}

export function initAccount(options) {
  callbacks = options;
  galleryOnly = Boolean(options.galleryOnly);
  modal = document.createElement('div');
  modal.className = 'pv-account';
  modal.hidden = true;
  modal.innerHTML = '<div class="pv-account__backdrop"></div><section class="pv-account__dialog" role="dialog" aria-modal="true" aria-label="PixelVerse account"><header><span>PIXELVERSE / ACCOUNT</span><button type="button" class="btn btn--ghost pv-account__close" aria-label="Close account">×</button></header><p class="pv-account__status" role="status" hidden></p><div class="pv-account__content"></div><footer class="pv-account__legal"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a><a href="terms.html" target="_blank" rel="noopener">Terms</a></footer></section>';
  document.body.appendChild(modal);
  content = modal.querySelector('.pv-account__content');
  status = modal.querySelector('.pv-account__status');
  modal.querySelector('.pv-account__close').addEventListener('click', closeAccount);
  modal.querySelector('.pv-account__backdrop').addEventListener('click', closeAccount);
  modal.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || modal.hidden) return;
    const items = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')]
      .filter(item => item.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) { event.preventDefault(); closeAccount(); }
  });
  document.querySelectorAll('[data-account-open]').forEach(button => button.addEventListener('click', () => openAccount()));
  const pendingTransfer = location.hash.startsWith('#google-transfer=');
  const pendingLink = location.hash === '#google-linked';
  Promise.allSettled([
    request('/auth/config').then(data => { config = data; }),
    pendingTransfer || pendingLink ? Promise.resolve() : refresh().then(async () => {
      if (!galleryOnly) {
        try { await loadProjects(); }
        catch (error) { setMessage(`Signed in, but cloud projects could not load: ${error.message}`); }
      }
    }).catch(error => {
      accessToken = null; user = null;
      if (!error.status || error.status >= 500)
        setMessage('Could not restore your session because the PixelVerse API is unavailable. Reload this page and try again.');
    }),
  ]).then(() => { render(); resolveAccountReady(); });

  if (pendingTransfer) {
    mode = 'transfer'; openAccount();
    const code = decodeURIComponent(location.hash.slice('#google-transfer='.length));
    history.replaceState(null, '', location.pathname + location.search);
    run(async () => {
      const data = await request('/auth/redeem-google-transfer', { method: 'POST', body: JSON.stringify({ code }) });
      accessToken = data.accessToken; user = data.user; selectedId = null;
      if (!galleryOnly) await loadProjects();
      setMessage(`Welcome, ${user.displayName}.`);
    });
  } else if (pendingLink) {
    history.replaceState(null, '', location.pathname + location.search);
    openAccount();
    run(async () => {
      await refresh();
      if (!galleryOnly) await loadProjects();
      setMessage('Google account linked.');
    });
  } else if (location.hash.startsWith('#verify=')) {
    mode = 'verify'; openAccount();
    const token = decodeURIComponent(location.hash.slice('#verify='.length));
    run(async () => {
      const result = await request('/auth/verify', { method: 'POST', body: JSON.stringify({ token }) });
      history.replaceState(null, '', location.pathname + location.search);
      mode = 'login'; setMessage(result.message);
    });
  } else if (location.hash.startsWith('#reset=')) {
    mode = 'reset'; openAccount();
  }
}
