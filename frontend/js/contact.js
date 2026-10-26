import { apiBase } from './core/apiBase.js';

const form = document.getElementById('contact-form');
const status = document.getElementById('contact-status');
const submit = document.getElementById('contact-submit');

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const fields = new FormData(form);
  const body = Object.fromEntries(['name', 'email', 'category', 'message', 'website']
    .map(key => [key, String(fields.get(key) ?? '').trim()]));
  submit.disabled = true;
  submit.textContent = 'Sending…';
  status.hidden = true;
  try {
    const response = await fetch(`${apiBase}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Your message could not be sent. Please try again.');
    form.reset();
    status.textContent = 'Message sent. Thanks for reaching out!';
    status.dataset.kind = 'success';
  } catch (error) {
    status.textContent = error.message || 'Your message could not be sent. Please try again.';
    status.dataset.kind = 'error';
  } finally {
    status.hidden = false;
    submit.disabled = false;
    submit.textContent = 'Send message';
    status.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
});
