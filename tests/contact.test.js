import test from 'node:test';
import assert from 'node:assert/strict';

test('contact messages go to the configured inbox and invalid requests are rejected', async () => {
  process.env.SMTP_URL = '';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_USER = 'sender@example.test';
  process.env.SMTP_PASS = 'test-only';
  process.env.MAIL_FROM = 'PixelVerse <sender@example.test>';
  process.env.CONTACT_TO = 'support@example.test';
  const nodemailer = (await import('nodemailer')).default;
  const originalTransport = nodemailer.createTransport;
  const sent = [];
  nodemailer.createTransport = () => ({
    sendMail: async mail => { sent.push(mail); return { accepted: [mail.to] }; },
    close() {},
  });
  const { app } = await import('../backend/app.js');
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/contact`;
  const post = async body => {
    try { return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch (error) { throw new Error(`Contact test request failed: ${error.cause || error}`, { cause: error }); }
  };
  try {
    const message = { name: 'Pixel Artist', email: 'artist@example.test', category: 'bug', message: 'The canvas did not open.' };
    assert.equal((await post({ ...message, email: 'bad-email' })).status, 400);
    assert.equal((await post({ ...message, category: 'urgent\nBcc: bad@example.test' })).status, 400);
    assert.equal((await post(message)).status, 202);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'support@example.test');
    assert.equal(sent[0].replyTo.address, 'artist@example.test');
    assert.match(sent[0].text, /The canvas did not open/);
    assert.equal((await post({ ...message, website: 'spam.example' })).status, 202);
    assert.equal(sent.length, 1);
  } finally {
    nodemailer.createTransport = originalTransport;
    await new Promise(resolve => server.close(resolve));
  }
});
