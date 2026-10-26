import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import mongoose from 'mongoose';
import { config } from './config.js';
import { User, Session, OneTimeToken } from './models/index.js';
import { authConfigured, normalizeEmail, googleEmailAuthoritative, validPassword, validName, newToken, hashToken, hashPassword, verifyPassword, signAccess, verifyAccess } from './security.js';
import { mailConfigured, sendAccountMail } from './mail.js';

export const authRouter = Router();
const googleClient = new OAuth2Client();
const authLimit = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });
const refreshLimit = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many session checks. Try again later.' } });

function httpError(status, message) { return Object.assign(new Error(message), { status }); }
function ready() { if (!authConfigured()) throw httpError(503, 'Authentication is not configured'); }
function publicUser(user) { return { id: String(user.id), displayName: user.displayName, email: user.email, emailVerified: Boolean(user.emailVerifiedAt), googleLinked: Boolean(user.googleSubject), moderator: Boolean(user.moderator) }; }
function rawRefresh(request) {
  const entry = request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('pv_refresh='));
  return entry ? entry.slice('pv_refresh='.length) : null;
}
function setRefresh(response, token) {
  response.cookie('pv_refresh', token, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/api/auth', maxAge: 30 * 24 * 60 * 60 * 1000 });
}
function clearRefresh(response) {
  response.clearCookie('pv_refresh', { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, path: '/api/auth' });
}
function checkOrigin(request) {
  if (request.headers.origin && !config.clientOrigins.includes(request.headers.origin)) throw httpError(403, 'Origin not allowed');
}
async function issueSession(user, response) {
  const refresh = newToken();
  const session = await Session.create({ userId: user._id, tokenHash: hashToken(refresh), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
  setRefresh(response, refresh);
  return { accessToken: await signAccess(user.id, session.id), user: publicUser(user) };
}
async function createOneTime(user, purpose, minutes) {
  const raw = newToken();
  const record = await OneTimeToken.create({ userId: user.id, tokenHash: hashToken(raw), purpose, expiresAt: new Date(Date.now() + minutes * 60 * 1000) });
  try { await sendAccountMail(user.email, purpose, raw); }
  catch (error) { await OneTimeToken.deleteOne({ _id: record.id }); throw error; }
}
async function verifyGoogleCredential(credential) {
  if (!config.googleClientId) throw httpError(503, 'Google sign-in is not configured');
  if (typeof credential !== 'string' || credential.length > 10000) throw httpError(400, 'Invalid Google credential');
  let ticket;
  try { ticket = await googleClient.verifyIdToken({ idToken: credential, audience: config.googleClientId }); }
  catch { throw httpError(401, 'Invalid Google credential'); }
  const claims = ticket.getPayload();
  const email = normalizeEmail(claims?.email);
  if (!claims?.sub || !email || claims.email_verified !== true) throw httpError(401, 'Google account email is not verified');
  return { subject: claims.sub, email, name: claims.name?.slice(0, 80) || email.split('@')[0], authoritative: googleEmailAuthoritative(email, claims.hd, claims.email_verified) };
}

export async function googleUserForVerifiedIdentity(identity) {
  let user = await User.findOne({ googleSubject: identity.subject }).select('+googleSubject');
  if (!user) {
    user = await User.findOne({ email: identity.email }).select('+googleSubject');
    if (user) {
      if (user.googleSubject && user.googleSubject !== identity.subject) throw httpError(409, 'Google account already linked to another identity');
      if (!identity.authoritative) throw httpError(409, 'Sign in with your password and link Google from your account');
      user.googleSubject = identity.subject;
      user.emailVerifiedAt = user.emailVerifiedAt || new Date();
      await user.save();
    } else {
      user = await User.create({ displayName: identity.name, email: identity.email, googleSubject: identity.subject, emailVerifiedAt: new Date() });
    }
  }
  return user;
}

async function googleUser(credential) {
  return googleUserForVerifiedIdentity(await verifyGoogleCredential(credential));
}

export async function linkGoogleToUser(userId, identity) {
  const user = await User.findById(userId).select('+googleSubject');
  if (!user || identity.email !== user.email) throw httpError(409, 'Google email must match this account');
  if (user.googleSubject && user.googleSubject !== identity.subject) throw httpError(409, 'A different Google account is already linked');
  const other = await User.findOne({ googleSubject: identity.subject });
  if (other && String(other.id) !== String(user.id)) throw httpError(409, 'Google account already linked');
  user.googleSubject = identity.subject;
  await user.save();
  return user;
}

export async function requireAuth(request, _response, next) {
  try {
    ready();
    const match = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw httpError(401, 'Sign in required');
    const payload = await verifyAccess(match[1]);
    if (!mongoose.isValidObjectId(payload.sub) || !mongoose.isValidObjectId(payload.sid)) throw httpError(401, 'Invalid session');
    const session = await Session.findOne({ _id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } });
    if (!session) throw httpError(401, 'Session expired');
    const user = await User.findById(payload.sub).select('+googleSubject');
    if (!user || !user.emailVerifiedAt) throw httpError(403, 'Email verification required');
    request.user = user;
    request.session = session;
    next();
  } catch (error) { next(error.status ? error : httpError(401, 'Invalid or expired access token')); }
}

authRouter.get('/config', (_request, response) => response.json({ googleClientId: config.googleClientId || null, emailRegistration: mailConfigured() && authConfigured() && mongoose.connection.readyState === 1 }));

authRouter.post('/register', authLimit(), async (request, response) => {
  ready();
  if (!mailConfigured()) throw httpError(503, 'Email registration is not configured');
  const email = normalizeEmail(request.body?.email);
  const { displayName, password } = request.body ?? {};
  if (!email || !validName(displayName) || !validPassword(password)) throw httpError(400, 'Enter a valid name, email, and password of at least 12 characters');
  const user = await User.create({ displayName: displayName.trim(), email, passwordHash: await hashPassword(password) });
  try { await createOneTime(user, 'verify', 24 * 60); }
  catch (error) { await User.deleteOne({ _id: user.id }); throw error; }
  response.status(201).json({ message: 'Check your email to verify your account.' });
});

authRouter.post('/verify', authLimit(), async (request, response) => {
  ready();
  const token = request.body?.token;
  if (typeof token !== 'string' || token.length > 100) throw httpError(400, 'Invalid verification link');
  const record = await OneTimeToken.findOneAndUpdate({ tokenHash: hashToken(token), purpose: 'verify', usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { new: true });
  if (!record) throw httpError(400, 'Verification link expired or already used');
  await User.updateOne({ _id: record.userId }, { $set: { emailVerifiedAt: new Date() } });
  response.json({ message: 'Email verified. You can sign in.' });
});

authRouter.post('/resend-verification', authLimit(), async (request, response) => {
  ready();
  if (!mailConfigured()) throw httpError(503, 'Email delivery is not configured');
  const email = normalizeEmail(request.body?.email);
  if (email) {
    const user = await User.findOne({ email, emailVerifiedAt: null });
    if (user) await createOneTime(user, 'verify', 24 * 60);
  }
  response.json({ message: 'If this account needs verification, an email has been sent.' });
});

authRouter.post('/login', authLimit(), async (request, response) => {
  ready();
  const email = normalizeEmail(request.body?.email);
  const password = request.body?.password;
  if (!email || !validPassword(password)) throw httpError(400, 'Invalid email or password');
  const user = await User.findOne({ email }).select('+passwordHash +googleSubject');
  if (!user || !await verifyPassword(password, user.passwordHash)) throw httpError(401, 'Invalid email or password');
  if (!user.emailVerifiedAt) throw httpError(403, 'Verify your email before signing in');
  response.json(await issueSession(user, response));
});

authRouter.post('/google', authLimit(), async (request, response) => {
  ready();
  const user = await googleUser(request.body?.credential);
  response.json(await issueSession(user, response));
});

authRouter.post('/google-transfer', authLimit(), async (request, response) => {
  ready();
  if (request.headers.origin !== 'http://localhost:5173') throw httpError(403, 'Origin not allowed');
  const audienceOrigin = request.body?.audienceOrigin;
  if (typeof audienceOrigin !== 'string' || !config.clientOrigins.includes(audienceOrigin)) throw httpError(400, 'Invalid return origin');
  const user = await googleUser(request.body?.credential);
  const code = newToken();
  await OneTimeToken.create({ userId: user.id, tokenHash: hashToken(code), purpose: 'google-transfer', audienceOrigin,
    expiresAt: new Date(Date.now() + 60 * 1000) });
  response.json({ code });
});

authRouter.post('/redeem-google-transfer', authLimit(), async (request, response) => {
  ready();
  const origin = request.headers.origin;
  if (!origin || !config.clientOrigins.includes(origin)) throw httpError(403, 'Origin not allowed');
  const code = request.body?.code;
  if (typeof code !== 'string' || code.length > 100) throw httpError(400, 'Invalid sign-in link');
  const record = await OneTimeToken.findOneAndUpdate({ tokenHash: hashToken(code), purpose: 'google-transfer', audienceOrigin: origin,
    usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { new: true });
  if (!record) throw httpError(400, 'Sign-in link expired or already used');
  const user = await User.findById(record.userId).select('+googleSubject');
  if (!user?.emailVerifiedAt) throw httpError(403, 'Account unavailable');
  response.json(await issueSession(user, response));
});

authRouter.post('/link-google', authLimit(), requireAuth, async (request, response) => {
  const identity = await verifyGoogleCredential(request.body?.credential);
  const user = await linkGoogleToUser(request.user.id, identity);
  response.json({ user: publicUser(user) });
});

authRouter.post('/google-link-intent', authLimit(), requireAuth, async (request, response) => {
  checkOrigin(request);
  const audienceOrigin = request.headers.origin;
  if (!audienceOrigin || !config.clientOrigins.includes(audienceOrigin)) throw httpError(403, 'Origin not allowed');
  const code = newToken();
  await OneTimeToken.create({ userId: request.user.id, tokenHash: hashToken(code), purpose: 'google-link', audienceOrigin,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  response.json({ code });
});

authRouter.post('/complete-google-link', authLimit(), async (request, response) => {
  ready();
  if (request.headers.origin !== 'http://localhost:5173') throw httpError(403, 'Origin not allowed');
  const { code, audienceOrigin } = request.body ?? {};
  if (typeof code !== 'string' || code.length > 100 || !config.clientOrigins.includes(audienceOrigin)) throw httpError(400, 'Invalid link request');
  const identity = await verifyGoogleCredential(request.body?.credential);
  const record = await OneTimeToken.findOneAndUpdate({ tokenHash: hashToken(code), purpose: 'google-link', audienceOrigin,
    usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { new: true });
  if (!record) throw httpError(400, 'Link request expired or already used');
  const user = await linkGoogleToUser(record.userId, identity);
  response.json({ user: publicUser(user) });
});

authRouter.post('/refresh', refreshLimit(), async (request, response) => {
  checkOrigin(request); ready();
  const old = rawRefresh(request);
  if (!old) throw httpError(401, 'Session expired');
  const nextToken = newToken();
  const session = await Session.findOneAndUpdate({ tokenHash: hashToken(old), revokedAt: null, expiresAt: { $gt: new Date() } }, { $set: { tokenHash: hashToken(nextToken) } }, { new: true });
  if (!session) throw httpError(401, 'Session expired');
  const user = await User.findById(session.userId).select('+googleSubject');
  if (!user || !user.emailVerifiedAt) { clearRefresh(response); throw httpError(401, 'Account unavailable'); }
  setRefresh(response, nextToken);
  response.json({ accessToken: await signAccess(user.id, session.id), user: publicUser(user) });
});

authRouter.post('/logout', requireAuth, async (request, response) => {
  checkOrigin(request);
  await Session.updateOne({ _id: request.session.id }, { $set: { revokedAt: new Date() } });
  clearRefresh(response);
  response.status(204).end();
});
authRouter.post('/logout-all', requireAuth, async (request, response) => {
  checkOrigin(request);
  await Session.updateMany({ userId: request.user.id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  clearRefresh(response);
  response.status(204).end();
});

authRouter.post('/forgot-password', authLimit(), async (request, response) => {
  ready();
  if (!mailConfigured()) throw httpError(503, 'Password recovery is not configured');
  const email = normalizeEmail(request.body?.email);
  if (email) {
    const user = await User.findOne({ email });
    if (user?.emailVerifiedAt) await createOneTime(user, 'reset', 30);
  }
  response.json({ message: 'If that account exists, a reset link has been sent.' });
});
authRouter.post('/reset-password', authLimit(), async (request, response) => {
  ready();
  const { token, password } = request.body ?? {};
  if (typeof token !== 'string' || token.length > 100 || !validPassword(password)) throw httpError(400, 'Invalid link or password');
  const record = await OneTimeToken.findOneAndUpdate({ tokenHash: hashToken(token), purpose: 'reset', usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { new: true });
  if (!record) throw httpError(400, 'Reset link expired or already used');
  await User.updateOne({ _id: record.userId }, { $set: { passwordHash: await hashPassword(password) } });
  await Session.updateMany({ userId: record.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  response.json({ message: 'Password changed. Sign in again.' });
});

authRouter.get('/me', requireAuth, (request, response) => response.json({ user: publicUser(request.user) }));
authRouter.patch('/me', requireAuth, async (request, response) => {
  if (!validName(request.body?.displayName)) throw httpError(400, 'Name must be 2–80 characters');
  request.user.displayName = request.body.displayName.trim();
  await request.user.save();
  response.json({ user: publicUser(request.user) });
});
