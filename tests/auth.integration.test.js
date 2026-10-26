import test from 'node:test';
import assert from 'node:assert/strict';

const testUri = process.env.MONGO_TEST_URI;
if (testUri) assert.equal(new URL(testUri).pathname, '/pixelverse_m2_integration_test',
  'MONGO_TEST_URI must select the disposable pixelverse_m2_integration_test database');

test('two accounts cannot read or alter each other’s cloud projects, and sessions revoke', { skip: !testUri }, async () => {
  process.env.JWT_SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
  process.env.CLIENT_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173';
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  process.env.SMTP_URL = '';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_USER = 'test';
  process.env.SMTP_PASS = 'test';
  process.env.MAIL_FROM = 'PixelVerse <test@example.test>';
  process.env.APP_ORIGIN = 'http://localhost:5173/blank.html';
  const nodemailer = (await import('nodemailer')).default;
  const originalTransport = nodemailer.createTransport;
  const capturedMail = [];
  nodemailer.createTransport = () => ({
    sendMail: async mail => { capturedMail.push(mail); return { accepted: [mail.to] }; },
    close() {},
  });
  const mongoose = (await import('mongoose')).default;
  const { app } = await import('../backend/app.js');
  const { googleUserForVerifiedIdentity, linkGoogleToUser } = await import('../backend/auth.js');
  const { indexedModels, User, OneTimeToken } = await import('../backend/models/index.js');
  const { hashPassword, newToken, hashToken } = await import('../backend/security.js');
  const { makeFrame } = await import('../frontend/js/frames/frameManager.js');
  const { Journal } = await import('../frontend/js/core/journal.js');
  const { serialise } = await import('../frontend/js/core/project.js');
  await mongoose.connect(testUri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all(indexedModels.map(model => model.init()));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const mailToken = purpose => {
    const match = capturedMail.at(-1)?.text.match(new RegExp(`#${purpose}=([A-Za-z0-9_-]+)`));
    assert.ok(match, `Expected ${purpose} link in account email`);
    return match[1];
  };
  const call = async (path, { method = 'GET', token, cookie, body, origin } = {}) => {
    const response = await fetch(base + path, { method, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  try {
    assert.equal((await call('/api/health')).status, 200);
    const passwordHash = await hashPassword('a-long-test-password');
    await User.create([
      { displayName: 'One', email: 'one@example.test', passwordHash, emailVerifiedAt: new Date() },
      { displayName: 'Two', email: 'two@example.test', passwordHash, emailVerifiedAt: new Date() },
    ]);
    const one = await call('/api/auth/login', { method: 'POST', body: { email: 'one@example.test', password: 'a-long-test-password' } });
    const two = await call('/api/auth/login', { method: 'POST', body: { email: 'two@example.test', password: 'a-long-test-password' } });
    assert.equal(one.status, 200);
    assert.equal(two.status, 200);
    assert.equal(one.body.user.googleLinked, false);
    assert.notEqual(one.body.user.id, two.body.user.id);
    const projectData = serialise({ frames: [makeFrame(32)], journal: new Journal(), gridSize: 32 });
    const created = await call('/api/projects', { method: 'POST', token: one.body.accessToken, body: { title: 'Private art', project: projectData } });
    assert.equal(created.status, 201);
    const id = created.body.project.id;
    assert.equal((await call(`/api/projects/${id}`, { token: one.body.accessToken })).body.project.data.v, 2);
    const independentSession = await call('/api/auth/login', { method: 'POST', body: { email: 'one@example.test', password: 'a-long-test-password' } });
    assert.equal(independentSession.status, 200);
    assert.notEqual(independentSession.cookie, one.cookie);
    assert.equal((await call(`/api/projects/${id}`, { token: independentSession.body.accessToken })).body.project.data.v, 2);
    assert.equal((await call('/api/projects', { token: two.body.accessToken })).body.projects.length, 0);
    assert.equal((await call(`/api/projects/${id}`, { token: two.body.accessToken })).status, 404);
    assert.equal((await call(`/api/projects/${id}`, { method: 'PUT', token: two.body.accessToken, body: { title: 'Stolen', project: projectData } })).status, 404);
    assert.equal((await call(`/api/projects/${id}`, { method: 'DELETE', token: two.body.accessToken })).status, 404);
    assert.equal((await call(`/api/projects/${id}`)).status, 401);
    const removable = await call('/api/projects', { method: 'POST', token: one.body.accessToken,
      body: { title: 'Removable copy', project: projectData } });
    assert.equal(removable.status, 201);
    assert.equal((await call(`/api/projects/${removable.body.project.id}`, { method: 'DELETE', token: one.body.accessToken })).status, 204);
    assert.equal((await call(`/api/projects/${removable.body.project.id}`, { token: one.body.accessToken })).status, 404);
    assert.equal((await call(`/api/projects/${id}`, { token: one.body.accessToken })).status, 200);
    const largeProject = serialise({ frames: [makeFrame(128)], journal: new Journal(), gridSize: 128 });
    assert.equal((await call('/api/projects', { method: 'POST', token: one.body.accessToken,
      body: { title: '128 pixel art', project: largeProject } })).status, 201);
    const transfer = newToken();
    await OneTimeToken.create({ userId: one.body.user.id, tokenHash: hashToken(transfer), purpose: 'google-transfer',
      audienceOrigin: 'http://127.0.0.1:5173', expiresAt: new Date(Date.now() + 60000) });
    assert.equal((await call('/api/auth/redeem-google-transfer', { method: 'POST', origin: 'http://localhost:5173',
      body: { code: transfer } })).status, 400);
    const redeemed = await call('/api/auth/redeem-google-transfer', { method: 'POST', origin: 'http://127.0.0.1:5173',
      body: { code: transfer } });
    assert.equal(redeemed.status, 200);
    assert.ok(redeemed.cookie);
    assert.equal((await call(`/api/projects/${id}`, { token: redeemed.body.accessToken })).status, 200);
    const galleryRefresh = await call('/api/auth/refresh', { method: 'POST', cookie: redeemed.cookie,
      origin: 'http://127.0.0.1:5173' });
    assert.equal(galleryRefresh.status, 200);
    assert.equal(galleryRefresh.body.user.id, one.body.user.id);
    assert.equal((await call('/api/auth/redeem-google-transfer', { method: 'POST', origin: 'http://127.0.0.1:5173',
      body: { code: transfer } })).status, 400);
    assert.equal((await call('/api/auth/google-link-intent', { method: 'POST', token: one.body.accessToken,
      origin: 'http://not-pixelverse.example' })).status, 403);
    const linkIntent = await call('/api/auth/google-link-intent', { method: 'POST', token: one.body.accessToken,
      origin: 'http://127.0.0.1:5173' });
    assert.equal(linkIntent.status, 200);
    assert.equal((await call('/api/auth/complete-google-link', { method: 'POST', origin: 'http://127.0.0.1:5173',
      body: { code: linkIntent.body.code, audienceOrigin: 'http://127.0.0.1:5173', credential: 'invalid' } })).status, 403);
    assert.equal((await call('/api/auth/complete-google-link', { method: 'POST', origin: 'http://localhost:5173',
      body: { code: linkIntent.body.code, audienceOrigin: 'http://127.0.0.1:5173', credential: 'invalid' } })).status, 401);
    assert.equal((await call('/api/auth/refresh', { method: 'POST', cookie: one.cookie, origin: 'http://not-pixelverse.example' })).status, 403);
    const refreshed = await call('/api/auth/refresh', { method: 'POST', cookie: one.cookie, origin: 'http://localhost:5173' });
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.cookie, one.cookie);
    const staleRefresh = await call('/api/auth/refresh', { method: 'POST', cookie: one.cookie });
    assert.equal(staleRefresh.status, 401);
    assert.equal(staleRefresh.cookie, undefined, 'A stale tab must not clear a newer refresh cookie');
    assert.equal((await call('/api/auth/logout', { method: 'POST', token: refreshed.body.accessToken, cookie: refreshed.cookie })).status, 204);
    assert.equal((await call('/api/auth/me', { token: refreshed.body.accessToken })).status, 401);
    const unverified = await User.create({ displayName: 'Three', email: 'three@example.test', passwordHash });
    const verification = newToken();
    await OneTimeToken.create({ userId: unverified.id, tokenHash: hashToken(verification), purpose: 'verify', expiresAt: new Date(Date.now() + 60000) });
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: unverified.email, password: 'a-long-test-password' } })).status, 403);
    assert.equal((await call('/api/auth/verify', { method: 'POST', body: { token: verification } })).status, 200);
    assert.equal((await call('/api/auth/verify', { method: 'POST', body: { token: verification } })).status, 400);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: unverified.email, password: 'a-long-test-password' } })).status, 200);
    const reset = newToken();
    await OneTimeToken.create({ userId: two.body.user.id, tokenHash: hashToken(reset), purpose: 'reset', expiresAt: new Date(Date.now() + 60000) });
    assert.equal((await call('/api/auth/reset-password', { method: 'POST', body: { token: reset, password: 'a-new-long-test-password' } })).status, 200);
    assert.equal((await call('/api/auth/me', { token: two.body.accessToken })).status, 401);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'two@example.test', password: 'a-long-test-password' } })).status, 401);
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'two@example.test', password: 'a-new-long-test-password' } })).status, 200);
    const registered = await call('/api/auth/register', { method: 'POST', body: {
      displayName: 'Mail Test', email: 'mail-test@gmail.com', password: 'a-registration-password',
    } });
    assert.equal(registered.status, 201);
    assert.equal(capturedMail.at(-1).to, 'mail-test@gmail.com');
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'mail-test@gmail.com', password: 'a-registration-password' } })).status, 403);
    assert.equal((await call('/api/auth/verify', { method: 'POST', body: { token: mailToken('verify') } })).status, 200);
    const registeredLogin = await call('/api/auth/login', { method: 'POST', body: { email: 'mail-test@gmail.com', password: 'a-registration-password' } });
    assert.equal(registeredLogin.status, 200);
    assert.equal(registeredLogin.body.user.googleLinked, false);
    const linked = await googleUserForVerifiedIdentity({ subject: 'google-mail-test', email: 'mail-test@gmail.com', name: 'Mail Test', authoritative: true });
    assert.equal(String(linked.id), registeredLogin.body.user.id);
    assert.equal((await call('/api/auth/me', { token: registeredLogin.body.accessToken })).body.user.googleLinked, true);
    assert.equal(String((await googleUserForVerifiedIdentity({ subject: 'google-mail-test', email: 'mail-test@gmail.com', name: 'Mail Test', authoritative: true })).id), registeredLogin.body.user.id);
    assert.equal((await call('/api/auth/forgot-password', { method: 'POST', body: { email: 'mail-test@gmail.com' } })).status, 200);
    assert.equal(capturedMail.at(-1).to, 'mail-test@gmail.com');
    assert.equal((await call('/api/auth/reset-password', { method: 'POST', body: { token: mailToken('reset'), password: 'a-reset-registration-password' } })).status, 200);
    assert.equal((await call('/api/auth/me', { token: registeredLogin.body.accessToken })).status, 401);
    const resetLogin = await call('/api/auth/login', { method: 'POST', body: { email: 'mail-test@gmail.com', password: 'a-reset-registration-password' } });
    assert.equal(resetLogin.body.user.id, registeredLogin.body.user.id);
    assert.equal(resetLogin.body.user.googleLinked, true);
    assert.equal((await call('/api/auth/refresh', { method: 'POST', cookie: resetLogin.cookie, origin: 'http://localhost:5173' })).body.user.googleLinked, true);
    const googleOnly = await googleUserForVerifiedIdentity({ subject: 'google-only-test', email: 'google-only@gmail.com', name: 'Google Only', authoritative: true });
    assert.equal((await call('/api/auth/forgot-password', { method: 'POST', body: { email: googleOnly.email } })).status, 200);
    assert.equal((await call('/api/auth/reset-password', { method: 'POST', body: { token: mailToken('reset'), password: 'a-google-account-password' } })).status, 200);
    const googlePasswordLogin = await call('/api/auth/login', { method: 'POST', body: { email: googleOnly.email, password: 'a-google-account-password' } });
    assert.equal(googlePasswordLogin.body.user.id, String(googleOnly.id));
    assert.equal(googlePasswordLogin.body.user.googleLinked, true);
    assert.equal(String((await linkGoogleToUser(googleOnly.id, { subject: 'google-only-test', email: googleOnly.email })).id), String(googleOnly.id));
    await assert.rejects(() => linkGoogleToUser(googleOnly.id, { subject: 'different-google-account', email: googleOnly.email }), { status: 409 });
  } finally {
    nodemailer.createTransport = originalTransport;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await new Promise(resolve => server.close(resolve));
  }
});
