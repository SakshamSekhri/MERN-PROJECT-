const STORAGE_PREFIX = 'pixelverse-tour-v1:';

function seen(id) {
  try { return localStorage.getItem(STORAGE_PREFIX + id) === 'done'; }
  catch { return false; }
}
function remember(id) {
  try { localStorage.setItem(STORAGE_PREFIX + id, 'done'); }
  catch { /* The guide still works when browser storage is unavailable. */ }
}
function visible(selector) {
  const element = document.querySelector(selector);
  if (!element || !element.getClientRects().length || element.closest('[hidden]')) return null;
  if (element.closest('.view:not(.is-active)')) return null;
  const style = getComputedStyle(element);
  return style.visibility === 'hidden' || style.display === 'none' ? null : element;
}

export function createOnboarding(tours) {
  const requested = new URLSearchParams(location.search).get('tour');
  const launcher = document.createElement('button');
  launcher.type = 'button';
  launcher.className = 'pv-tour-launcher';
  launcher.textContent = '? Guide';
  launcher.setAttribute('aria-label', 'Open PixelVerse guided tours');
  launcher.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'pv-tour-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', 'Guided tours');
  const menuTitle = document.createElement('strong');
  menuTitle.textContent = 'CHOOSE A GUIDE';
  menu.append(menuTitle);
  for (const tour of tours) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.dataset.tourId = tour.id;
    choice.textContent = tour.title;
    choice.addEventListener('click', () => start(tour.id));
    menu.append(choice);
  }
  const handbook = document.createElement('a');
  handbook.href = 'guides.html';
  handbook.textContent = 'Read all guides →';
  menu.append(handbook);

  const layer = document.createElement('div');
  layer.className = 'pv-tour-layer';
  layer.hidden = true;
  const shade = Array.from({ length: 4 }, () => {
    const piece = document.createElement('div');
    piece.className = 'pv-tour-shade';
    layer.append(piece);
    return piece;
  });
  const focus = document.createElement('div');
  focus.className = 'pv-tour-focus';
  layer.append(focus);
  const card = document.createElement('section');
  card.className = 'pv-tour-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', 'PixelVerse guided tour');
  const kicker = document.createElement('span');
  kicker.className = 'pv-tour-kicker';
  const heading = document.createElement('h2');
  const copy = document.createElement('p');
  const actions = document.createElement('div');
  actions.className = 'pv-tour-actions';
  const back = document.createElement('button');
  back.type = 'button'; back.className = 'btn btn--ghost'; back.textContent = 'Back';
  const skip = document.createElement('button');
  skip.type = 'button'; skip.className = 'btn btn--ghost'; skip.textContent = 'Skip';
  const next = document.createElement('button');
  next.type = 'button'; next.className = 'btn btn--sun'; next.textContent = 'Next';
  actions.append(back, skip, next);
  card.append(kicker, heading, copy, actions);
  layer.append(card);
  document.body.append(launcher, menu, layer);

  let active = null;
  let steps = [];
  let index = 0;
  let frame = 0;
  let autoTimer = 0;

  function close(markSeen = true) {
    if (active && markSeen) remember(active.id);
    active = null;
    steps = [];
    layer.hidden = true;
    launcher.hidden = false;
    document.body.classList.remove('pv-tour-open');
    launcher.focus({ preventScroll: true });
  }
  function place() {
    if (!active) return;
    const target = visible(steps[index].target);
    if (!target) { close(false); return; }
    const bounds = target.getBoundingClientRect();
    const width = window.innerWidth, height = window.innerHeight;
    const x = Math.max(6, bounds.left - 5), y = Math.max(6, bounds.top - 5);
    const right = Math.min(width - 6, bounds.right + 5);
    const bottom = Math.min(height - 6, bounds.bottom + 5);
    const set = (piece, left, top, w, h) => Object.assign(piece.style, {
      left: `${left}px`, top: `${top}px`, width: `${Math.max(0, w)}px`, height: `${Math.max(0, h)}px`,
    });
    set(shade[0], 0, 0, width, y);
    set(shade[1], 0, y, x, bottom - y);
    set(shade[2], right, y, width - right, bottom - y);
    set(shade[3], 0, bottom, width, height - bottom);
    set(focus, x, y, right - x, bottom - y);

    const cardWidth = card.offsetWidth, cardHeight = card.offsetHeight;
    const margin = 12;
    let left, top;
    if (width < 700) {
      left = Math.max(margin, (width - cardWidth) / 2);
      const bottomPosition = height - cardHeight - margin;
      top = bottomPosition < bottom + margin && y >= cardHeight + margin * 2
        ? margin : bottomPosition;
    } else if (width - right >= cardWidth + 24) {
      left = right + 12; top = y;
    } else if (x >= cardWidth + 24) {
      left = x - cardWidth - 12; top = y;
    } else if (height - bottom >= cardHeight + 24) {
      left = x; top = bottom + 12;
    } else {
      left = x; top = y - cardHeight - 12;
    }
    card.style.left = `${Math.max(margin, Math.min(left, width - cardWidth - margin))}px`;
    card.style.top = `${Math.max(margin, Math.min(top, height - cardHeight - margin))}px`;
  }
  function schedulePlace() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(place);
  }
  function show() {
    const step = steps[index];
    const target = visible(step.target);
    if (!target) { close(false); return; }
    kicker.textContent = `${active.title.toUpperCase()} · ${index + 1} / ${steps.length}`;
    heading.textContent = step.title;
    copy.textContent = step.text;
    back.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? 'Finish' : 'Next';
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    schedulePlace();
    next.focus({ preventScroll: true });
  }
  function start(id) {
    const tour = tours.find(item => item.id === id);
    if (!tour) return false;
    const available = tour.steps.filter(step => visible(step.target));
    if (!available.length) return false;
    clearTimeout(autoTimer);
    active = tour;
    steps = available;
    index = 0;
    menu.hidden = true;
    launcher.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    layer.hidden = false;
    document.body.classList.add('pv-tour-open');
    show();
    return true;
  }
  function maybeStart(id, attempts = 0) {
    if (active || (requested && requested !== id) || (!requested && seen(id))) return;
    if (document.body.classList.contains('is-modal-open')) {
      if (attempts < 5) autoTimer = setTimeout(() => maybeStart(id, attempts + 1), 1000);
      return;
    }
    autoTimer = setTimeout(() => start(id), 550);
  }
  function move(delta) {
    if (!active) return;
    if (delta > 0 && index === steps.length - 1) { close(); return; }
    index = Math.max(0, Math.min(steps.length - 1, index + delta));
    show();
  }

  launcher.addEventListener('click', () => {
    for (const choice of menu.querySelectorAll('button[data-tour-id]')) {
      const tour = tours.find(item => item.id === choice.dataset.tourId);
      choice.hidden = !tour.steps.some(step => visible(step.target));
    }
    menu.hidden = !menu.hidden;
    launcher.setAttribute('aria-expanded', String(!menu.hidden));
  });
  back.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  skip.addEventListener('click', () => close());
  document.addEventListener('pointerdown', event => {
    if (!menu.hidden && !menu.contains(event.target) && event.target !== launcher) {
      menu.hidden = true;
      launcher.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', event => {
    if (!active) {
      if (event.key === 'Escape') menu.hidden = true;
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); move(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); event.stopPropagation(); move(-1); }
    if (event.key === 'Tab') {
      const controls = [back, skip, next].filter(item => !item.disabled);
      const position = controls.indexOf(document.activeElement);
      if (event.shiftKey && position <= 0) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && position === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
    }
  }, true);
  window.addEventListener('resize', schedulePlace);
  window.addEventListener('scroll', schedulePlace, true);
  return { start, maybeStart, close, isActive: () => Boolean(active) };
}
