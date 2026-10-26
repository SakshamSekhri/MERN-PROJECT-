import test from 'node:test';
import assert from 'node:assert/strict';
import { selectWebPort } from '../scripts/local-dev-ports.mjs';

test('web startup uses 5173 when it is free', async () => {
  assert.equal(await selectWebPort(async () => false), 5173);
});

test('web startup uses 5174 only when PixelVerse owns 5173', async () => {
  assert.equal(await selectWebPort(async port => port === 5173, async () => true), 5174);
});

test('web startup rejects another app on 5173', async () => {
  await assert.rejects(selectWebPort(async port => port === 5173, async () => false), /another app/);
});

test('web startup rejects a third site when both ports are occupied', async () => {
  await assert.rejects(selectWebPort(async () => true, async () => true), /5173 and 5174/);
});
