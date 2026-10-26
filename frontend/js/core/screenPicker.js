import { bindCapturePicker } from './screenCapturePicker.js';

export function bindScreenPicker(button, status, onColor) {
  if (!button) return;
  if (!window.isSecureContext || typeof window.EyeDropper !== 'function') {
    bindCapturePicker(button, status, onColor);
    return;
  }

  button.addEventListener('click', async () => {
    let selection;
    try {
      // Opening must happen directly inside the user's click, before any await.
      selection = new window.EyeDropper().open();
    } catch (error) {
      if (status) status.textContent = 'Could not start screen picking. Try Chrome or Edge.';
      return;
    }

    button.disabled = true;
    if (status) status.textContent = 'Choose a colour anywhere on your screen. Press Esc to cancel.';
    try {
      const color = (await selection)?.sRGBHex?.toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error('Invalid screen colour');
      onColor(color);
      if (status) status.textContent = `Picked ${color.toUpperCase()} from screen.`;
    } catch (error) {
      if (status) status.textContent = error?.name === 'AbortError'
        ? 'Screen picking cancelled.'
        : 'Screen picking failed. Try Chrome or Edge.';
    } finally {
      button.disabled = false;
    }
  });
}
