import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config.js';

const scrypt = promisify(scryptCallback);
const ISSUER = 'pixelverse';
const AUDIENCE = 'pixelverse-api';

export function authConfigured() { return config.jwtSecret.length >= 32; }
function signingKey() {
  if (!authConfigured()) throw Object.assign(new Error('JWT_SECRET must contain at least 32 characters'), { status: 503 });
  return new TextEncoder().encode(config.jwtSecret);
}

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
export function googleEmailAuthoritative(email, hostedDomain, verified) {
  return verified === true && (email.endsWith('@gmail.com') || Boolean(hostedDomain));
}
export function validPassword(value) { return typeof value === 'string' && value.length >= 12 && value.length <= 128; }
export function validName(value) { return typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80; }
export function newToken() { return randomBytes(32).toString('base64url'); }
export function hashToken(token) { return createHash('sha256').update(token).digest('hex'); }

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [algorithm, salt, hex] = stored.split(':');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hex ?? '')) return false;
  const candidate = await scrypt(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hex, 'hex'));
}

export async function signAccess(userId, sessionId) {
  return new SignJWT({ sid: String(sessionId) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER).setAudience(AUDIENCE).setSubject(String(userId))
    .setIssuedAt().setExpirationTime('15m').sign(signingKey());
}
export async function verifyAccess(token) {
  const { payload } = await jwtVerify(token, signingKey(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
  return payload;
}
