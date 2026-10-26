import { initAccount, openAccount, currentAccount, accountReady, accountRequest } from './views/accountModal.js';
import { decodeGrid } from './core/codec.js';
import { apiBase } from './core/apiBase.js';
import { createOnboarding } from './views/onboarding.js';
import { galleryTours } from './views/tourContent.js';

const root = document.getElementById('gallery-view');
const status = document.getElementById('gallery-status');
const activityButton = document.getElementById('gallery-activity-button');
const params = new URLSearchParams(location.search);
let page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
let sort = ['trending', 'following', 'saved'].includes(params.get('sort')) ? params.get('sort') : 'recent';
const artworkQuery = (params.get('q') || '').slice(0, 60);
const artworkTag = (params.get('tag') || '').slice(0, 24);
let detail = params.get('art');
let artist = params.get('artist');
let people = params.get('people');
let profileTab = 'created';
let commentsBefore = null;
const guide = createOnboarding(galleryTours);

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function button(label, className, action) {
  const node = el('button', `btn ${className}`, label);
  node.type = 'button'; node.addEventListener('click', action); return node;
}
function note(message) { status.textContent = message; status.hidden = !message; }
async function publicGet(path) {
  const response = await fetch(`${apiBase}${path}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not load gallery');
  return data;
}
function navigate(next) { location.assign(`gallery.html${next ? `?${next}` : ''}`); }
function askAccount() {
  if (currentAccount()) return true;
  openAccount(); note('Sign in to join the conversation.'); return false;
}
async function refreshActivityButton() {
  activityButton.hidden = !currentAccount();
  if (!currentAccount()) return;
  try {
    const data = await accountRequest('/notifications?page=1');
    if (!currentAccount()) return;
    activityButton.textContent = data.unread ? `Activity ${data.unread}` : 'Activity';
    activityButton.setAttribute('aria-label', data.unread
      ? `Activity, ${data.unread} unread notifications` : 'Activity');
  } catch (error) { activityButton.textContent = 'Activity'; }
}
function activityText(item) {
  const actor = item.actor?.displayName || 'An artist';
  if (item.type === 'follow') return `${actor} followed you`;
  if (item.type === 'like') return `${actor} liked your artwork`;
  if (item.type === 'comment') return `${actor} commented on your artwork`;
  return 'Artwork activity';
}
function activityDestination(item) {
  if (item.type === 'follow') return `gallery.html?artist=${encodeURIComponent(item.actor.id)}`;
  return `gallery.html?art=${encodeURIComponent(item.artworkId)}`;
}
function openActivity() {
  if (!askAccount()) return;
  const trigger = document.activeElement;
  const dialog = el('dialog', 'gallery-connections gallery-activity');
  dialog.setAttribute('aria-labelledby', 'gallery-activity-title');
  const header = el('div', 'gallery-connections__header');
  const heading = el('h2', '', 'Activity'); heading.id = 'gallery-activity-title';
  const close = button('×', 'btn--ghost', () => dialog.close()); close.setAttribute('aria-label', 'Close activity');
  header.append(heading, close);
  const list = el('div', 'gallery-connections__list'); list.setAttribute('aria-live', 'polite');
  const footer = el('div', 'gallery-connections__footer gallery-activity__footer');
  dialog.append(header, list, footer);
  const onAccountChange = () => { if (!currentAccount() && dialog.open) dialog.close(); };
  window.addEventListener('pixelverse:account', onAccountChange);
  dialog.addEventListener('close', () => {
    window.removeEventListener('pixelverse:account', onAccountChange);
    dialog.remove(); if (trigger?.isConnected) trigger.focus(); void refreshActivityButton();
  });
  document.body.append(dialog); dialog.showModal(); close.focus();
  let nextPage = 1;
  async function load() {
    footer.replaceChildren();
    if (nextPage === 1) list.replaceChildren(el('p', 'gallery-meta', 'Loading activity…'));
    try {
      const data = await accountRequest(`/notifications?page=${nextPage}`);
      if (!dialog.isConnected) return;
      if (nextPage === 1) list.replaceChildren();
      const visible = data.notifications;
      if (!visible.length && nextPage === 1) list.append(el('p', 'gallery-empty', 'No activity yet. New follows, likes, and comments will appear here.'));
      visible.forEach(item => {
        const row = el('article', `gallery-activity__row${item.readAt ? '' : ' gallery-activity__row--unread'}`);
        const open = button(activityText(item), 'gallery-activity__open', async () => {
          try { await accountRequest(`/notifications/${item.id}/read`, { method: 'PATCH' }); }
          catch (error) { note(error.message); }
          location.assign(activityDestination(item));
        });
        row.append(open, el('small', 'gallery-meta', new Date(item.createdAt).toLocaleString()));
        list.append(row);
      });
      activityButton.textContent = data.unread ? `Activity ${data.unread}` : 'Activity';
      nextPage++;
      if (data.unread) footer.append(button('Mark all read', 'btn--ghost', async () => {
        try {
          await accountRequest('/notifications/read-all', { method: 'POST' });
          list.querySelectorAll('.gallery-activity__row').forEach(row => row.classList.remove('gallery-activity__row--unread'));
          activityButton.textContent = 'Activity';
          footer.querySelector('.gallery-activity__read-all')?.remove();
        } catch (error) { footer.prepend(el('p', 'gallery-status', error.message)); }
      }));
      footer.querySelector('.btn')?.classList.add('gallery-activity__read-all');
      if (data.hasMore) footer.append(button('Load more', 'btn--ghost', load));
    } catch (error) {
      if (!dialog.isConnected) return;
      if (nextPage === 1) list.replaceChildren();
      footer.append(el('p', 'gallery-status', error.message), button('Try again', 'btn--ghost', load));
    }
  }
  void load();
}
activityButton.addEventListener('click', openActivity);
function card(art) {
  const node = el('article', 'gallery-card');
  const open = el('a', 'gallery-card__open'); open.href = `gallery.html?art=${encodeURIComponent(art.id)}`;
  const image = el('img', 'gallery-card__art'); image.src = art.thumbnail; image.alt = `${art.title} pixel art`;
  open.append(image);
  const body = el('div', 'gallery-card__body');
  if (art.example) body.append(el('span', 'gallery-card__example', 'PIXELVERSE EXAMPLE'));
  if (art.frames > 1) body.append(el('span', 'gallery-card__frames', `${art.frames} FRAMES`));
  const title = el('a', 'gallery-card__title', art.title); title.href = open.href;
  const author = el('a', 'gallery-card__author', `by ${art.author.displayName}`);
  author.href = `gallery.html?artist=${encodeURIComponent(art.author.id)}`;
  body.append(title, author, el('span', '', `♥ ${art.likes}  ·  👎 ${art.dislikes}  ·  ${art.commentCount} comments`));
  if (art.tags?.length) body.append(el('span', 'gallery-card__tags', art.tags.slice(0, 3).map(tag => `#${tag}`).join('  ')));
  node.append(open, body);
  return node;
}
function searchForm(value = '') {
  const form = el('form', 'gallery-search');
  const input = el('input'); input.type = 'search'; input.name = 'people'; input.placeholder = 'Search artists by name or @username';
  input.setAttribute('aria-label', 'Search artists'); input.maxLength = 40; input.minLength = 2; input.required = true; input.value = value;
  form.append(input, button('Search', 'btn--cyan', () => {}));
  form.querySelector('button').type = 'submit';
  form.addEventListener('submit', event => {
    event.preventDefault();
    const query = input.value.trim().replace(/^@/, '');
    if (query.length >= 2) navigate(`people=${encodeURIComponent(query)}`);
  });
  return form;
}
function artworkSearchForm() {
  const form = el('form', 'gallery-search gallery-discovery');
  const query = el('input'); query.type = 'search'; query.maxLength = 60;
  query.placeholder = 'Search artwork by title, description, or tag'; query.value = artworkQuery;
  query.setAttribute('aria-label', 'Search artwork');
  const tag = el('input'); tag.type = 'text'; tag.maxLength = 24; tag.value = artworkTag;
  tag.placeholder = 'Tag (optional)'; tag.setAttribute('aria-label', 'Filter by tag');
  const submit = el('button', 'btn btn--sun', 'Find art'); submit.type = 'submit';
  form.append(query, tag, submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const next = new URLSearchParams();
    if (query.value.trim()) next.set('q', query.value.trim());
    if (tag.value.trim()) next.set('tag', tag.value.trim().replace(/^#/, '').toLowerCase());
    navigate(next.toString());
  });
  return form;
}
function feedParameters(nextPage = page) {
  const next = new URLSearchParams({ sort, page: String(nextPage) });
  if (artworkQuery && !['following', 'saved'].includes(sort)) next.set('q', artworkQuery);
  if (artworkTag && !['following', 'saved'].includes(sort)) next.set('tag', artworkTag);
  return next.toString();
}
function paging(host, hasMore) {
  const bar = el('div', 'gallery-pagination');
  if (page > 1) bar.append(button('← Previous', 'btn--ghost', () => {
    page--; navigate(artist ? `artist=${encodeURIComponent(artist)}&tab=${profileTab}&page=${page}` : feedParameters());
  }));
  bar.append(el('span', 'gallery-meta', `Page ${page}`));
  if (hasMore) bar.append(button('Next →', 'btn--ghost', () => {
    page++; navigate(artist ? `artist=${encodeURIComponent(artist)}&tab=${profileTab}&page=${page}` : feedParameters());
  }));
  host.append(bar);
}
function avatar(name, thumbnail = null) {
  const node = el('div', 'gallery-avatar');
  if (thumbnail) {
    const image = el('img'); image.src = thumbnail; image.alt = '';
    node.append(image);
  } else node.textContent = (name.trim()[0] || 'P').toUpperCase();
  node.setAttribute('aria-hidden', 'true');
  return node;
}
function openConnections(profile, kind) {
  const title = kind === 'followers' ? 'Followers' : 'Following';
  const trigger = document.activeElement;
  const dialog = el('dialog', 'gallery-connections');
  dialog.setAttribute('aria-labelledby', 'gallery-connections-title');
  const header = el('div', 'gallery-connections__header');
  const heading = el('h2', '', title); heading.id = 'gallery-connections-title';
  const close = button('×', 'btn--ghost', () => dialog.close());
  close.setAttribute('aria-label', `Close ${title.toLowerCase()} list`);
  header.append(heading, close);
  const list = el('div', 'gallery-connections__list');
  list.setAttribute('aria-live', 'polite');
  const footer = el('div', 'gallery-connections__footer');
  dialog.append(header, list, footer);
  let changed = false;
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (changed && artist === profile.id) void showFeed().catch(error => note(error.message));
    else if (trigger?.isConnected) trigger.focus();
  });
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
  let nextPage = 1;
  async function load() {
    footer.replaceChildren();
    if (nextPage === 1) list.replaceChildren(el('p', 'gallery-meta', `Loading ${title.toLowerCase()}…`));
    try {
      const data = await publicGet(`/gallery/users/${encodeURIComponent(profile.id)}/${kind}?page=${nextPage}`);
      if (!dialog.isConnected) return;
      if (nextPage === 1) list.replaceChildren();
      if (!data.users.length && nextPage === 1) list.append(el('p', 'gallery-empty', `No ${title.toLowerCase()} yet.`));
      let followedIds = new Set();
      if (currentAccount() && data.users.length) {
        try {
          const state = await accountRequest(`/gallery/users/me/following-ids?ids=${data.users.map(person => person.id).join(',')}`);
          followedIds = new Set(state.ids);
        } catch (error) { footer.append(el('p', 'gallery-status', error.message)); }
      }
      data.users.forEach(person => {
        const row = el('article', 'gallery-person gallery-connections__person');
        const about = el('div');
        about.append(el('strong', '', person.displayName), el('span', 'gallery-profile__handle', `@${person.username}`));
        if (person.bio) about.append(el('p', 'gallery-meta', person.bio));
        const actions = el('div', 'gallery-connections__actions');
        actions.append(button('View profile', 'btn--ghost', () => navigate(`artist=${encodeURIComponent(person.id)}`)));
        if (person.id !== currentAccount()?.id) {
          let followed = followedIds.has(person.id);
          const follow = button(followed ? 'Following ✓' : 'Follow', followed ? 'btn--ghost' : 'btn--sun', async () => {
            if (!currentAccount()) { dialog.close(); askAccount(); return; }
            follow.disabled = true;
            try {
              const result = await accountRequest(`/gallery/users/${person.id}/follow`, { method: followed ? 'DELETE' : 'PUT' });
              followed = result.following;
              follow.textContent = followed ? 'Following ✓' : 'Follow';
              follow.className = `btn ${followed ? 'btn--ghost' : 'btn--sun'}`;
              changed = true;
            } catch (error) { footer.replaceChildren(el('p', 'gallery-status', error.message)); }
            finally { follow.disabled = false; }
          });
          actions.append(follow);
        }
        row.append(avatar(person.displayName, person.avatarThumbnail), about, actions);
        list.append(row);
      });
      nextPage++;
      if (data.hasMore) footer.append(button('Load more', 'btn--ghost', load));
    } catch (error) {
      if (!dialog.isConnected) return;
      if (nextPage === 1) list.replaceChildren();
      footer.append(el('p', 'gallery-status', error.message), button('Try again', 'btn--ghost', load));
    }
  }
  void load();
}
async function profileHeader(profile) {
  const hero = el('section', 'gallery-panel gallery-profile');
  if (profile.featuredArtwork) {
    const featured = el('a', 'gallery-profile__featured');
    featured.href = `gallery.html?art=${encodeURIComponent(profile.featuredArtwork.id)}`;
    const image = el('img'); image.src = profile.featuredArtwork.thumbnail;
    image.alt = `Featured pixel art: ${profile.featuredArtwork.title}`;
    featured.append(image, el('span', '', `FEATURED ART · ${profile.featuredArtwork.title}`));
    hero.append(featured);
  }
  const identity = el('div', 'gallery-profile__identity');
  const name = el('div');
  name.append(el('h2', '', profile.displayName), el('span', 'gallery-profile__handle', `@${profile.username}`));
  identity.append(avatar(profile.displayName, profile.avatarThumbnail), name);
  const stats = el('div', 'gallery-profile__stats');
  const followerCount = el('strong', '', String(profile.followers));
  const followerLabel = document.createTextNode(profile.followers === 1 ? ' follower' : ' followers');
  const followers = button('', 'gallery-profile__stat', () => openConnections(profile, 'followers'));
  followers.append(followerCount, followerLabel);
  const following = button('', 'gallery-profile__stat', () => openConnections(profile, 'following'));
  following.append(el('strong', '', String(profile.following)), document.createTextNode(' following'));
  stats.append(followers, following, el('span', '', `${profile.created} artworks`));
  const actions = el('div', 'gallery-actions');
  if (currentAccount()?.id === profile.id) {
    const form = el('form', 'gallery-profile-edit'); form.hidden = true;
    const handleLabel = el('label', 'gallery-field', 'Username');
    const handle = el('input'); handle.name = 'username'; handle.maxLength = 24; handle.minLength = 3;
    handle.pattern = '[A-Za-z0-9_]{3,24}'; handle.required = true;
    handle.value = profile.username;
    handle.placeholder = 'Your unique username'; handleLabel.append(handle);
    const bioLabel = el('label', 'gallery-field', 'Bio');
    const bio = el('textarea'); bio.name = 'bio'; bio.maxLength = 280; bio.rows = 3;
    bio.placeholder = 'Tell people about your pixel art'; bio.value = profile.bio;
    bioLabel.append(bio);
    const avatarLabel = el('label', 'gallery-field', 'Pixel avatar');
    const avatarChoice = el('select'); avatarChoice.name = 'avatarArtworkId'; avatarChoice.disabled = true;
    avatarChoice.append(new Option('Use initial', ''));
    const avatarPreview = el('span', 'gallery-profile-edit__preview');
    avatarLabel.append(avatarChoice, avatarPreview);
    const featuredLabel = el('label', 'gallery-field', 'Featured artwork');
    const featuredChoice = el('select'); featuredChoice.name = 'featuredArtworkId'; featuredChoice.disabled = true;
    featuredChoice.append(new Option('None', ''));
    const featuredPreview = el('span', 'gallery-profile-edit__preview');
    featuredLabel.append(featuredChoice, featuredPreview);
    const visualHelp = el('p', 'gallery-meta', 'Choose from your public artwork. Publish a piece first if this list is empty.');
    const save = button('Save profile', 'btn--sun', () => {}); save.type = 'submit'; save.disabled = true;
    form.append(handleLabel, bioLabel, avatarLabel, featuredLabel, visualHelp, save);
    let choicesLoaded = false;
    let artworkById = new Map();
    function preview(select, target) {
      const work = artworkById.get(select.value);
      target.replaceChildren();
      if (!work) return;
      const image = el('img'); image.src = work.thumbnail; image.alt = '';
      target.append(image, el('span', '', work.title));
    }
    avatarChoice.addEventListener('change', () => preview(avatarChoice, avatarPreview));
    featuredChoice.addEventListener('change', () => preview(featuredChoice, featuredPreview));
    form.addEventListener('submit', async event => {
      event.preventDefault(); save.disabled = true;
      try {
        await accountRequest('/gallery/users/me', { method: 'PATCH', body: JSON.stringify({
          username: handle.value, bio: bio.value,
          avatarArtworkId: avatarChoice.value || null, featuredArtworkId: featuredChoice.value || null,
        }) });
        note('Profile updated.'); await showFeed();
      } catch (error) { note(error.message); save.disabled = false; }
    });
    actions.append(button('Edit profile', 'btn--ghost', async () => {
      form.hidden = !form.hidden;
      if (form.hidden) return;
      handle.focus();
      if (choicesLoaded) return;
      try {
        const choices = await accountRequest('/gallery/users/me/artwork-choices');
        artworkById = new Map(choices.artworks.map(art => [art.id, art]));
        choices.artworks.forEach(art => {
          avatarChoice.append(new Option(art.title, art.id));
          featuredChoice.append(new Option(art.title, art.id));
        });
        avatarChoice.value = profile.avatarArtworkId || '';
        featuredChoice.value = profile.featuredArtworkId || '';
        preview(avatarChoice, avatarPreview); preview(featuredChoice, featuredPreview);
        avatarChoice.disabled = false; featuredChoice.disabled = false; save.disabled = false; choicesLoaded = true;
      } catch (error) { note(error.message); }
    }));
    hero.append(identity, el('p', 'gallery-profile__bio', profile.bio || 'Add a bio to tell other artists about yourself.'), stats, actions, form);
  } else {
    let followed = false;
    if (currentAccount()) {
      try { followed = (await accountRequest(`/gallery/users/${profile.id}/follow`)).following; }
      catch (error) { note(error.message); }
    }
    const followButton = button(followed ? 'Following ✓' : 'Follow artist', followed ? 'btn--ghost' : 'btn--sun', async () => {
      if (!askAccount()) return;
      followButton.disabled = true;
      try {
        const result = await accountRequest(`/gallery/users/${profile.id}/follow`, { method: followed ? 'DELETE' : 'PUT' });
        followed = result.following;
        followButton.textContent = followed ? 'Following ✓' : 'Follow artist';
        followButton.className = `btn ${followed ? 'btn--ghost' : 'btn--sun'}`;
        followerCount.textContent = String(result.followers);
        followerLabel.textContent = result.followers === 1 ? ' follower' : ' followers';
      } catch (error) { note(error.message); }
      finally { followButton.disabled = false; }
    });
    actions.append(followButton);
    hero.append(identity, el('p', 'gallery-profile__bio', profile.bio || 'PixelVerse artist'), stats, actions);
  }
  hero.append(el('p', 'gallery-meta', `Joined ${new Date(profile.joinedAt).toLocaleDateString()}`));
  return hero;
}
async function showPeople() {
  const query = (people || '').trim().replace(/^@/, '');
  const data = await publicGet(`/gallery/users/search?q=${encodeURIComponent(query)}`);
  root.replaceChildren();
  const toolbar = el('div', 'gallery-toolbar');
  toolbar.append(button('← Gallery', 'btn--ghost', () => navigate('')), el('h2', 'gallery-section-title', 'Find artists'));
  if (currentAccount()) toolbar.append(button('My profile', 'btn--ghost', () => navigate(`artist=${currentAccount().id}`)));
  root.append(toolbar, searchForm(query));
  if (!data.users.length) { root.append(el('p', 'gallery-empty', 'No artists found. Try a different name or username.')); return; }
  const list = el('div', 'gallery-people');
  data.users.forEach(person => {
    const row = el('article', 'gallery-person gallery-panel');
    const about = el('div');
    about.append(el('strong', '', person.displayName), el('span', 'gallery-profile__handle', `@${person.username}`));
    if (person.bio) about.append(el('p', 'gallery-meta', person.bio));
    row.append(avatar(person.displayName, person.avatarThumbnail), about,
      button('View profile', 'btn--sun', () => navigate(`artist=${encodeURIComponent(person.id)}`)));
    list.append(row);
  });
  root.append(list);
}
async function showFeed() {
  const data = artist ? await publicGet(`/gallery/users/${encodeURIComponent(artist)}?page=${page}`)
    : sort === 'following' ? currentAccount() ? await accountRequest(`/gallery/following?page=${page}`)
      : { artworks: [], hasMore: false, followingCount: 0 }
      : sort === 'saved' ? currentAccount() ? await accountRequest(`/gallery/saved?page=${page}`)
        : { artworks: [], hasMore: false }
        : await publicGet(`/gallery?${feedParameters()}`);
  root.replaceChildren();
  const toolbar = el('div', 'gallery-toolbar');
  if (artist) {
    toolbar.append(button('← All artwork', 'btn--ghost', () => navigate('')));
    root.append(toolbar, searchForm(), await profileHeader(data.user));
    const tabs = el('div', 'gallery-toolbar');
    tabs.append(button(`Created ${data.user.created}`, profileTab === 'created' ? 'btn--sun' : 'btn--ghost',
      () => navigate(`artist=${encodeURIComponent(artist)}&tab=created`)));
    root.append(tabs);
  } else {
    toolbar.append(el('h2', 'gallery-section-title', 'Explore artwork'),
      button('Recent', sort === 'recent' ? 'btn--sun' : 'btn--ghost', () => navigate('sort=recent')),
      button('Trending', sort === 'trending' ? 'btn--sun' : 'btn--ghost', () => navigate('sort=trending')),
      button('Following', sort === 'following' ? 'btn--sun' : 'btn--ghost', () => navigate('sort=following')),
      button('Saved art', sort === 'saved' ? 'btn--sun' : 'btn--ghost', () => {
        if (askAccount()) navigate('sort=saved');
      }));
    if (currentAccount()) toolbar.append(button('My profile', 'btn--ghost', () => navigate(`artist=${currentAccount().id}`)));
    root.append(toolbar, artworkSearchForm(), searchForm());
  }
  if (['following', 'saved'].includes(sort) && !artist && !currentAccount()) {
    root.append(el('p', 'gallery-empty', sort === 'saved'
      ? 'Sign in to save artwork and find it here later.'
      : 'Sign in to follow artists and see their new work here.'),
      button('Sign in', 'btn--sun', () => openAccount()));
    return;
  }
  const grid = el('div', 'gallery-grid');
  if (!data.artworks.length) root.append(el('p', 'gallery-empty', artist
    ? 'No public artwork here yet.'
    : sort === 'following' ? 'Follow artists to fill this feed with their public artwork.'
      : sort === 'saved' ? 'Save artwork you love to find it here later.'
      : artworkQuery || artworkTag ? 'No artwork matches that search. Try another word or tag.'
      : 'No artwork here yet. Open the canvas and publish a finished piece.'));
  else { data.artworks.forEach(art => grid.append(card(art))); root.append(grid); }
  paging(root, data.hasMore);
  if (currentAccount()?.moderator) root.append(button('Moderation queue', 'btn--ghost', showModeration));
}
function renderFrame(canvas, art, index) {
  const frame = art.project.frames[index];
  const grid = decodeGrid(frame.g);
  canvas.width = art.project.gridSize; canvas.height = art.project.gridSize;
  const context = canvas.getContext('2d');
  context.fillStyle = '#19172c'; context.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid.length; x++) {
    if (!grid[y][x]) continue;
    context.fillStyle = grid[y][x]; context.fillRect(x, y, 1, 1);
  }
}
async function showDetail() {
  const data = await accountRequest(`/gallery/${encodeURIComponent(detail)}`);
  const art = data.artwork;
  root.replaceChildren();
  root.append(button('← Gallery', 'btn--ghost', () => navigate('')));
  const panel = el('section', 'gallery-panel gallery-detail');
  const left = el('div'); const wrap = el('div', 'gallery-art-wrap'); const canvas = el('canvas');
  wrap.append(canvas); left.append(wrap);
  let frameIndex = art.project.frames.findIndex(frame => frame.id === art.coverFrameId);
  if (frameIndex < 0) frameIndex = art.project.activeFrame;
  const frameBar = el('div', 'gallery-actions');
  const frameLabel = el('span', 'gallery-meta');
  const draw = () => { renderFrame(canvas, art, frameIndex); frameLabel.textContent = `Frame ${frameIndex + 1} of ${art.project.frames.length}`; };
  frameBar.append(button('←', 'btn--ghost btn--sm', () => { frameIndex = (frameIndex + art.project.frames.length - 1) % art.project.frames.length; draw(); }),
    frameLabel, button('→', 'btn--ghost btn--sm', () => { frameIndex = (frameIndex + 1) % art.project.frames.length; draw(); }));
  left.append(frameBar); draw();
  const info = el('div', 'gallery-info');
  info.append(el('span', 'gallery-badge', `${art.example ? 'PIXELVERSE EXAMPLE · ' : ''}${art.visibility} · ${art.gridSize} × ${art.gridSize}`), el('h2', '', art.title));
  const author = el('button', 'gallery-link', `by ${art.author.displayName}`);
  author.type = 'button'; author.addEventListener('click', () => navigate(`artist=${encodeURIComponent(art.author.id)}`));
  info.append(author, el('p', '', art.description || 'No description.'));
  if (art.tags?.length) {
    const tags = el('div', 'gallery-tags');
    art.tags.forEach(tag => tags.append(button(`#${tag}`, 'btn--ghost btn--sm', () => navigate(`tag=${encodeURIComponent(tag)}`))));
    info.append(tags);
  }
  if (art.contributors.length > 1) {
    const team = el('div', 'gallery-meta'); team.append(el('strong', '', 'Team contributors'));
    art.contributors.forEach(person => {
      const row = el('p');
      const link = el('button', 'gallery-link', person.displayName);
      link.type = 'button'; link.addEventListener('click', () => navigate(`artist=${encodeURIComponent(person.id)}&tab=${'created'}`));
      row.append(link, document.createTextNode(` · ${person.changes} accepted changes`));
      team.append(row);
    });
    info.append(team);
  }
  info.append(el('p', 'gallery-meta', `Published ${new Date(art.createdAt).toLocaleDateString()}`));
  const stats = el('p', 'gallery-meta', `♥ ${art.likes}  ·  👎 ${art.dislikes}  ·  ${art.commentCount} comments`); info.append(stats);
  const actions = el('div', 'gallery-actions');
  if (art.visibility !== 'private') {
    const save = button('Save art', 'btn--ghost', async () => {
      if (!askAccount()) return;
      save.disabled = true;
      try {
        const next = save.dataset.saved !== 'true';
        await accountRequest(`/gallery/${art.id}/bookmark`, { method: next ? 'PUT' : 'DELETE' });
        save.dataset.saved = String(next); save.textContent = next ? '✓ Saved art' : 'Save art';
        note(next ? 'Added to Saved art.' : 'Removed from Saved art.');
      } catch (error) { note(error.message); }
      finally { save.disabled = false; }
    });
    actions.append(save);
    if (currentAccount()) accountRequest(`/gallery/${art.id}/bookmark`).then(result => {
      save.dataset.saved = String(result.saved); save.textContent = result.saved ? '✓ Saved art' : 'Save art';
    }).catch(() => {});
  }
  if (currentAccount()?.id !== art.author.id) {
    const react = async value => {
      if (!askAccount()) return;
      try { const result = await accountRequest(`/gallery/${art.id}/reaction`, { method: 'PUT', body: JSON.stringify({ value }) });
        art.likes = result.likes; art.dislikes = result.dislikes;
        stats.textContent = `♥ ${result.likes}  ·  👎 ${result.dislikes}  ·  ${art.commentCount} comments`;
        note(result.value ? `Your ${result.value} was saved.` : 'Reaction removed.');
      } catch (error) { note(error.message); }
    };
    actions.append(button('♥ Like', 'btn--lime', () => react('like')), button('👎 Dislike', 'btn--ghost', () => react('dislike')),
      button('Remove reaction', 'btn--ghost', () => react(null)), button('Report art', 'btn--ghost', () => report(art.id)));
  } else {
    const select = el('select');
    ['public', 'unlisted', 'private'].forEach(value => { const option = el('option', '', value); option.value = value; select.append(option); });
    select.value = art.visibility;
    select.addEventListener('change', async () => {
      try { await accountRequest(`/gallery/${art.id}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility: select.value }) });
        note('Visibility updated.'); await showDetail(); }
      catch (error) { note(error.message); select.value = art.visibility; }
    });
    actions.append(select, button('Unpublish', 'btn--danger', async () => {
      if (!confirm('Unpublish this artwork? Its gallery link will stop working.')) return;
      try { await accountRequest(`/gallery/${art.id}/unpublish`, { method: 'POST' }); navigate(''); }
      catch (error) { note(error.message); }
    }));
    const tagsForm = el('form', 'gallery-tags-edit');
    const tagsInput = el('input'); tagsInput.type = 'text'; tagsInput.maxLength = 150;
    tagsInput.value = (art.tags || []).join(', '); tagsInput.placeholder = 'Tags separated by commas';
    tagsInput.setAttribute('aria-label', 'Artwork tags, separated by commas');
    const update = el('button', 'btn btn--ghost', 'Update tags'); update.type = 'submit';
    tagsForm.append(tagsInput, update);
    tagsForm.addEventListener('submit', async event => {
      event.preventDefault(); update.disabled = true;
      try {
        await accountRequest(`/gallery/${art.id}/tags`, { method: 'PATCH', body: JSON.stringify({
          tags: tagsInput.value.split(',').map(tag => tag.trim()).filter(Boolean),
        }) });
        await showDetail(); note('Tags updated.');
      } catch (error) { note(error.message); update.disabled = false; }
    });
    info.append(tagsForm);
  }
  info.append(actions);
  panel.append(left, info); root.append(panel);
  if (art.visibility === 'private') return;
  const comments = el('section', 'gallery-panel gallery-comments'); comments.append(el('h2', 'gallery-section-title', 'Comments'));
  const form = el('form', 'gallery-field');
  const input = el('textarea'); input.rows = 3; input.maxLength = 1000; input.placeholder = 'Share a thought about this artwork'; input.required = true;
  form.append(input, button('Post comment', 'btn--sun', () => {}));
  form.querySelector('button').type = 'submit';
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!askAccount()) return;
    try { await accountRequest(`/gallery/${art.id}/comments`, { method: 'POST', body: JSON.stringify({ text: input.value }) });
      input.value = ''; commentsBefore = null; art.commentCount++;
      stats.textContent = `♥ ${art.likes}  ·  👎 ${art.dislikes}  ·  ${art.commentCount} comments`;
      await loadComments(art, list, more); note('Comment posted.'); }
    catch (error) { note(error.message); }
  });
  const list = el('div'); const more = el('div', 'gallery-actions');
  comments.append(form, list, more); root.append(comments);
  commentsBefore = null; await loadComments(art, list, more);
}
async function loadComments(art, list, more) {
  const data = await publicGet(`/gallery/${art.id}/comments${commentsBefore ? `?before=${encodeURIComponent(commentsBefore)}` : ''}`);
  if (!commentsBefore) list.replaceChildren();
  data.comments.forEach(comment => {
    const row = el('article', 'gallery-comment');
    const author = el('button', 'gallery-link', comment.author.displayName);
    author.type = 'button'; author.addEventListener('click', () => navigate(`artist=${encodeURIComponent(comment.author.id)}`));
    row.append(author, el('small', 'gallery-meta', ` · ${new Date(comment.createdAt).toLocaleString()}`), el('p', '', comment.text));
    const actions = el('div', 'gallery-actions');
    if ([comment.author.id, art.author.id].includes(currentAccount()?.id) || currentAccount()?.moderator) {
      actions.append(button('Remove', 'btn--danger btn--sm', async () => {
        if (!confirm('Remove this comment?')) return;
        try { await accountRequest(`/gallery/${art.id}/comments/${comment.id}`, { method: 'DELETE' });
          await showDetail(); note('Comment removed.'); } catch (error) { note(error.message); }
      }));
    }
    if (comment.author.id !== currentAccount()?.id) actions.append(button('Report', 'btn--ghost btn--sm', () => report(art.id, comment.id)));
    row.append(actions); list.append(row);
  });
  more.replaceChildren();
  if (data.nextBefore) more.append(button('Older comments', 'btn--ghost', async () => {
    commentsBefore = data.nextBefore;
    try { await loadComments(art, list, more); } catch (error) { note(error.message); }
  }));
}
async function report(artId, commentId = null) {
  if (!askAccount()) return;
  const reason = prompt('Report reason: spam, abuse, or other');
  if (reason === null) return;
  try { await accountRequest(`/gallery/${artId}/reports`, { method: 'POST', body: JSON.stringify({ reason: reason.trim().toLowerCase(), commentId }) }); note('Report received. Thank you.'); }
  catch (error) { note(error.message); }
}
async function showModeration() {
  if (!currentAccount()?.moderator) return;
  const data = await accountRequest('/gallery/moderation/reports');
  root.replaceChildren(button('← Gallery', 'btn--ghost', () => navigate('')), el('h2', 'gallery-section-title', 'Moderation queue'));
  if (!data.reports.length) root.append(el('p', 'gallery-empty', 'No open reports.'));
  for (const report of data.reports) {
    const row = el('article', 'gallery-panel');
    row.append(el('p', '', `${report.reason} · ${report.commentId ? 'comment' : 'artwork'} · ${new Date(report.createdAt).toLocaleString()}`),
      el('p', '', report.artworkTitle));
    if (report.commentText) row.append(el('p', 'gallery-meta', report.commentText));
    row.append(button('View artwork', 'btn--ghost', () => navigate(`art=${report.artworkId}`)));
    ['hide', 'restore', 'dismiss'].forEach(action => row.append(button(action, action === 'hide' ? 'btn--danger' : 'btn--ghost', async () => {
      try { await accountRequest(`/gallery/moderation/reports/${report.id}`, { method: 'POST', body: JSON.stringify({ action }) });
        await showModeration(); note(`Report ${action} complete.`); }
      catch (error) { note(error.message); }
    })));
    root.append(row);
  }
}

async function boot() {
  initAccount({ galleryOnly: true, saveLocal: () => {}, beforeSignOut: async () => {} });
  await accountReady;
  void refreshActivityButton();
  window.addEventListener('pixelverse:account', () => {
    void refreshActivityButton();
    if (detail) void showDetail().catch(error => note(error.message));
    else if (people) void showPeople().catch(error => note(error.message));
    else void showFeed().catch(error => note(error.message));
  });
  window.addEventListener('focus', () => { void refreshActivityButton(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshActivityButton(); });
  window.setInterval(() => { if (!document.hidden && currentAccount()) void refreshActivityButton(); }, 60000);
  try {
    if (detail) await showDetail(); else if (people) await showPeople(); else await showFeed();
    if (params.get('activity') === '1') openActivity();
    else guide.maybeStart(detail ? 'gallery-artwork' : 'gallery');
  }
  catch (error) { note(error.message); root.replaceChildren(el('p', 'gallery-empty', 'Could not load this artwork.')); }
}
void boot();
