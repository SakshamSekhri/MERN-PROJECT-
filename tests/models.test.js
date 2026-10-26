import test from 'node:test';
import assert from 'node:assert/strict';
import { User, Canvas, Artwork, ArtistFollow } from '../backend/models/index.js';

test('database models reserve identity, project ownership, artwork, and follows', () => {
  const hasIndex = (model, fields, unique = false) => model.schema.indexes().some(([keys, options]) =>
    JSON.stringify(keys) === JSON.stringify(fields) && Boolean(options.unique) === unique);
  assert.ok(hasIndex(User, { email: 1 }, true));
  assert.ok(hasIndex(User, { googleSubject: 1 }, true));
  assert.ok(hasIndex(Canvas, { ownerId: 1, updatedAt: -1 }));
  assert.ok(hasIndex(Artwork, { authorId: 1, createdAt: -1 }));
  assert.ok(hasIndex(ArtistFollow, { followerId: 1, artistId: 1 }, true));
});
