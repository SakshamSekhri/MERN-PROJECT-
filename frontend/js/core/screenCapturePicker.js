const MAX_PREVIEW_PIXELS = 16_000_000;

function makeCanvas(width, height) {
  if (!width || !height) throw new Error('No image was available to sample');
  const scale = Math.min(1, Math.sqrt(MAX_PREVIEW_PIXELS / (width * height)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas colour sampling is unavailable');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

async function captureFrame(stream) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Screen capture timed out')), 5000);
      const ready = () => { clearTimeout(timeout); resolve(); };
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(ready);
      else if (video.readyState >= 2) ready();
      else video.addEventListener('loadeddata', ready, { once: true });
    });
    const { canvas, context } = makeCanvas(video.videoWidth, video.videoHeight);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    video.pause();
    video.srcObject = null;
    stream.getTracks().forEach(track => track.stop());
  }
}

async function loadScreenshot(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a screenshot image');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not open that screenshot'));
      image.src = url;
    });
    const { canvas, context } = makeCanvas(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

function showColorPreview(canvas, trigger, status, onColor, source) {
  const overlay = document.createElement('div');
  overlay.className = 'screen-pick-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Choose a screen colour');
  overlay.innerHTML = `<div class="screen-pick-dialog">
    <div class="screen-pick-dialog__head"><strong>PIXELVERSE / PICK COLOUR</strong>
      <button class="btn btn--ghost btn--sm" type="button">Cancel</button></div>
    <p>Click a colour in this ${source}. This image stays on your device and is discarded when you close this window.</p>
    <div class="screen-pick-dialog__image"></div></div>`;
  canvas.className = 'screen-pick-preview';
  canvas.setAttribute('aria-label', `Click a colour in the ${source}`);
  overlay.querySelector('.screen-pick-dialog__image').append(canvas);
  const cancel = overlay.querySelector('button');
  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    trigger.focus();
  };
  const onKey = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      status.textContent = 'Colour picking cancelled.';
      close();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      cancel.focus();
    }
  };
  cancel.addEventListener('click', () => { status.textContent = 'Colour picking cancelled.'; close(); });
  canvas.addEventListener('click', event => {
    try {
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((event.clientX - rect.left) * canvas.width / rect.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((event.clientY - rect.top) * canvas.height / rect.height)));
      const rgb = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
      const color = `#${[rgb[0], rgb[1], rgb[2]].map(value => value.toString(16).padStart(2, '0')).join('')}`;
      onColor(color);
      status.textContent = `Picked ${color.toUpperCase()} from ${source}.`;
    } catch { status.textContent = 'Could not read that colour. Try another image.'; }
    close();
  });
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  cancel.focus();
  status.textContent = `Click a colour in the ${source}, or press Esc to cancel.`;
}

export function bindCapturePicker(button, status, onColor) {
  const canCapture = window.isSecureContext && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  button.parentElement?.classList?.add('screen-pick-fallback');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.hidden = true;
  button.after(fileInput);
  const chooseFile = () => { fileInput.value = ''; fileInput.click(); };
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try { showColorPreview(await loadScreenshot(file), button, status, onColor, 'screenshot'); }
    catch (error) { status.textContent = error.message; }
  });
  if (!canCapture) {
    button.textContent = 'Pick from screenshot';
    button.title = 'Choose a screenshot image to sample a colour';
    button.addEventListener('click', chooseFile);
    status.textContent = 'Screen capture is unavailable here. Choose a screenshot instead.';
    return;
  }
  button.title = 'Share a screen or window, then click a colour in the preview';
  const fileButton = document.createElement('button');
  fileButton.type = 'button';
  fileButton.className = `${button.className} screen-pick-file`;
  fileButton.textContent = 'Use screenshot';
  fileButton.title = 'Choose a screenshot instead of sharing your screen';
  fileInput.after(fileButton);
  fileButton.addEventListener('click', chooseFile);
  button.addEventListener('click', async () => {
    let request;
    try { request = navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); }
    catch { status.textContent = 'Could not start screen capture. Use a screenshot instead.'; return; }
    button.disabled = true;
    status.textContent = 'Choose a screen, window, or tab to share. PixelVerse will capture one frame and stop sharing.';
    try { showColorPreview(await captureFrame(await request), button, status, onColor, 'screen preview'); }
    catch (error) {
      status.textContent = ['NotAllowedError', 'AbortError'].includes(error?.name)
        ? 'Screen sharing cancelled. You can use a screenshot instead.'
        : 'Screen capture failed. You can use a screenshot instead.';
    } finally { button.disabled = false; }
  });
}
