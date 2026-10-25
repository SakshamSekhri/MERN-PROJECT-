import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFrame } from '../frontend/js/frames/frameManager.js';
import { Journal } from '../frontend/js/core/journal.js';
import { serialise } from '../frontend/js/core/project.js';
import { validateProject } from '../backend/models/projectValidation.js';
import { hashPassword, verifyPassword, hashToken, normalizeEmail, validPassword, googleEmailAuthoritative } from '../backend/security.js';

test('passwords are salted and verified without storing plaintext', async () => {
  const first = await hashPassword('a-long-test-password');
  const second = await hashPassword('a-long-test-password');
  assert.notEqual(first, second);
  assert.equal(first.includes('a-long-test-password'), false);
  assert.equal(await verifyPassword('a-long-test-password', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(await verifyPassword('anything', 'invalid'), false);
  assert.equal(validPassword('short'), false);
  assert.equal(normalizeEmail(' Artist@Example.COM '), 'artist@example.com');
  assert.equal(hashToken('secret').length, 64);
  assert.equal(googleEmailAuthoritative('artist@gmail.com', undefined, true), true);
  assert.equal(googleEmailAuthoritative('artist@company.com', 'company.com', true), true);
  assert.equal(googleEmailAuthoritative('artist@example.com', undefined, true), false);
});

test('cloud projects accept the editor format and reject malformed grids', () => {
  const project = serialise({ frames: [makeFrame(32)], journal: new Journal(), gridSize: 32 });
  assert.equal(validateProject(project), true);
  const large = serialise({ frames: [makeFrame(128)], journal: new Journal(), gridSize: 128 });
  assert.equal(validateProject(large), true);
  assert.equal(validateProject({ ...project, gridSize: 512 }), false);
  assert.equal(validateProject({ ...project, frames: [] }), false);
  assert.equal(validateProject({ ...project, frames: [project.frames[0], project.frames[0]] }), false);
  const bad = structuredClone(project);
  bad.frames[0].g.r = [1024, 4];
  assert.equal(validateProject(bad), false);
});
