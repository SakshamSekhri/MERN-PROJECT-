import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCapturePicker } from '../frontend/js/core/screenCapturePicker.js';

function withBrowser(secure, mediaDevices, run) {
  const previous = Object.fromEntries(['window', 'navigator', 'document'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const element = () => ({
    listeners: {},
    after(node) { (this.afterNodes ||= []).push(node); },
    addEventListener(name, listener) { this.listeners[name] = listener; },
    click() { this.clicked = true; },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: secure } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: element } });
  const button = element();
  button.className = 'btn screen-pick-button';
  button.disabled = false;
  const status = { textContent: '' };
  return Promise.resolve().then(() => run(button, status)).finally(() => {
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
}

test('unsupported browsers keep a working screenshot picker', () => withBrowser(false, undefined, button => {
  bindCapturePicker(button, { textContent: '' }, () => {});
  const fileInput = button.afterNodes[0];
  assert.equal(button.textContent, 'Pick from screenshot');
  assert.equal(button.disabled, false);
  button.listeners.click();
  assert.equal(fileInput.clicked, true);
}));

test('denied screen sharing keeps the screenshot alternative available', () => withBrowser(true, {
  getDisplayMedia: () => Promise.reject({ name: 'NotAllowedError' }),
}, async (button, status) => {
  bindCapturePicker(button, status, () => {});
  const fileInput = button.afterNodes[0];
  const fileButton = fileInput.afterNodes[0];
  await button.listeners.click();
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /cancelled/);
  fileButton.listeners.click();
  assert.equal(fileInput.clicked, true);
}));
