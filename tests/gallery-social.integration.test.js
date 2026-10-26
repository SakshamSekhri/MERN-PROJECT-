import test from 'node:test';
import assert from 'node:assert/strict';

const baseUri = process.env.MONGO_TEST_URI;
if (baseUri) assert.equal(new URL(baseUri).pathname, '/pixelverse_m2_integration_test',
  'MONGO_TEST_URI must select the disposable pixelverse_m2_integration_test database');

test('artist search, profiles, follows, and Following feed preserve artwork visibility', { skip: !baseUri }, async () => {
  process.env.JWT_SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
  process.env.CLIENT_ORIGINS = 'http://localhost:5173';
  const mongoose = (await import('mongoose')).default;
  const { app } = await import('../backend/app.js');
  const { indexedModels, User, ArtistFollow } = await import('../backend/models/index.js');
  const { hashPassword } = await import('../backend/security.js');
  const { makeFrame } = await import('../frontend/js/frames/frameManager.js');
  const { Journal } = await import('../frontend/js/core/journal.js');
  const { serialise } = await import('../frontend/js/core/project.js');
  const uri = baseUri.replace('/pixelverse_m2_integration_test', '/pixelverse_social_integration_test');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all(indexedModels.map(model => model.init()));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'GET', token, body } = {}) => {
    const response = await fetch(base + path, { method, headers: { Origin: 'http://localhost:5173',
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  try {
    const passwordHash = await hashPassword('a-long-test-password');
    const users = await User.create(['Mira Artist', 'Noah Artist', 'Ari Helper'].map((displayName, index) => ({
      displayName, email: `social-${index}@example.test`, passwordHash, emailVerifiedAt: new Date(),
    })));
    const tokens = [];
    for (let index = 0; index < users.length; index++) {
      const login = await call('/api/auth/login', { method: 'POST', body: { email: `social-${index}@example.test`, password: 'a-long-test-password' } });
      assert.equal(login.status, 200); tokens.push(login.body.accessToken);
    }
    const project = serialise({ frames: [makeFrame(16)], journal: new Journal(), gridSize: 16 });
    const publicArt = await call('/api/gallery', { method: 'POST', token: tokens[0], body: {
      title: 'Public pixels', description: 'A moonlit forest', tags: ['forest', 'night-sky'], project, visibility: 'public',
    } });
    const privateArt = await call('/api/gallery', { method: 'POST', token: tokens[0], body: { title: 'Private pixels', project, visibility: 'private' } });
    const unlistedArt = await call('/api/gallery', { method: 'POST', token: tokens[0], body: { title: 'Unlisted pixels', project, visibility: 'unlisted' } });
    assert.equal(publicArt.status, 201);
    assert.deepEqual(publicArt.body.artwork.tags, ['forest', 'night-sky']);
    assert.deepEqual((await call('/api/gallery?q=moonlit')).body.artworks.map(art => art.id), [publicArt.body.artwork.id]);
    assert.deepEqual((await call('/api/gallery?tag=forest')).body.artworks.map(art => art.id), [publicArt.body.artwork.id]);
    assert.equal((await call('/api/gallery?tag=private')).body.artworks.length, 0);
    assert.equal((await call('/api/gallery', { method: 'POST', token: tokens[0], body: {
      title: 'Invalid tags', tags: ['forest', 'forest'], project,
    } })).status, 400);
    assert.equal((await call(`/api/gallery/${publicArt.body.artwork.id}/tags`, { method: 'PATCH', token: tokens[1],
      body: { tags: ['new-tag'] } })).status, 404);
    assert.deepEqual((await call(`/api/gallery/${publicArt.body.artwork.id}/tags`, { method: 'PATCH', token: tokens[0],
      body: { tags: ['forest', 'castle'] } })).body.artwork.tags, ['forest', 'castle']);
    assert.equal((await call(`/api/gallery/${privateArt.body.artwork.id}/bookmark`, { method: 'PUT', token: tokens[1] })).status, 404);
    assert.equal((await call(`/api/gallery/${publicArt.body.artwork.id}/bookmark`, { method: 'PUT' })).status, 401);
    assert.equal((await call(`/api/gallery/${publicArt.body.artwork.id}/bookmark`, { method: 'PUT', token: tokens[1] })).body.saved, true);
    assert.equal((await call(`/api/gallery/${publicArt.body.artwork.id}/bookmark`, { method: 'PUT', token: tokens[1] })).body.saved, true);
    assert.deepEqual((await call('/api/gallery/saved', { token: tokens[1] })).body.artworks.map(art => art.id), [publicArt.body.artwork.id]);
    assert.equal((await call('/api/gallery/saved')).status, 401);
    assert.equal((await call(`/api/gallery/${publicArt.body.artwork.id}/bookmark`, { token: tokens[1] })).body.saved, true);
    const profile = await call(`/api/gallery/users/${users[0].id}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.user.created, 1);
    assert.equal(profile.body.artworks.length, 1);
    assert.ok(!('email' in profile.body.user));
    assert.match(profile.body.user.username, /^pv_mira_art_[a-f0-9]{10}$/);
    const searchByName = await call('/api/gallery/users/search?q=Mira');
    assert.deepEqual(searchByName.body.users.map(user => user.id), [String(users[0].id)]);
    assert.ok(!('email' in searchByName.body.users[0]));
    const rename = await call('/api/gallery/users/me', { method: 'PATCH', token: tokens[0],
      body: { username: 'mira_pixels', bio: 'Making tiny worlds.' } });
    assert.equal(rename.status, 200);
    assert.equal(rename.body.user.username, 'mira_pixels');
    assert.equal((await call('/api/gallery/users/search?q=mira_pixels')).body.users[0].id, String(users[0].id));
    assert.equal((await call('/api/gallery/users/me', { method: 'PATCH', token: tokens[1],
      body: { username: 'mira_pixels', bio: '' } })).status, 409);
    assert.equal((await call('/api/gallery/users/me', { method: 'PATCH', token: tokens[1],
      body: { username: 'pv_admin', bio: '' } })).status, 400);
    const choices = await call('/api/gallery/users/me/artwork-choices', { token: tokens[0] });
    assert.deepEqual(choices.body.artworks.map(art => art.id), [publicArt.body.artwork.id]);
    const visuals = await call('/api/gallery/users/me', { method: 'PATCH', token: tokens[0], body: {
      username: 'mira_pixels', bio: 'Making tiny worlds.', avatarArtworkId: publicArt.body.artwork.id,
      featuredArtworkId: publicArt.body.artwork.id,
    } });
    assert.equal(visuals.status, 200);
    assert.equal(visuals.body.user.avatarThumbnail, publicArt.body.artwork.thumbnail);
    assert.equal(visuals.body.user.featuredArtwork.id, publicArt.body.artwork.id);
    assert.equal((await call('/api/gallery/users/search?q=mira_pixels')).body.users[0].avatarThumbnail, publicArt.body.artwork.thumbnail);
    assert.equal((await call('/api/gallery/users/me', { method: 'PATCH', token: tokens[0], body: {
      username: 'mira_pixels', bio: '', avatarArtworkId: privateArt.body.artwork.id,
    } })).status, 400);

    assert.equal((await call(`/api/gallery/users/${users[0].id}/follow`, { method: 'PUT' })).status, 401);
    assert.equal((await call(`/api/gallery/users/${users[0].id}/follow`, { method: 'PUT', token: tokens[0] })).status, 403);
    assert.equal((await call('/api/gallery/following')).status, 401);
    assert.equal((await call(`/api/gallery/users/${users[0].id}/follow`, { method: 'PUT', token: tokens[1] })).body.followers, 1);
    const followActivity = await call('/api/notifications', { token: tokens[0] });
    assert.equal(followActivity.body.unread, 1);
    assert.equal(followActivity.body.notifications[0].type, 'follow');
    assert.equal(followActivity.body.notifications[0].actor.id, String(users[1].id));
    assert.equal((await call(`/api/notifications/${followActivity.body.notifications[0].id}/read`, { method: 'PATCH', token: tokens[1] })).status, 404);
    assert.equal((await call(`/api/gallery/users/${users[0].id}/follow`, { method: 'PUT', token: tokens[1] })).body.followers, 1);
    assert.equal((await call(`/api/gallery/users/${users[0].id}/follow`, { token: tokens[1] })).body.following, true);
    assert.deepEqual((await call(`/api/gallery/users/me/following-ids?ids=${users[0].id},${users[2].id}`, { token: tokens[1] })).body.ids,
      [String(users[0].id)]);
    assert.equal((await call(`/api/gallery/${publicArt.body.artwork.id}/reaction`, { method: 'PUT', token: tokens[1], body: { value: 'like' } })).status, 200);
    assert.equal((await call(`/api/gallery/${publicArt.body.artwork.id}/comments`, { method: 'POST', token: tokens[1], body: { text: 'Great pixels' } })).status, 201);
    const activity = await call('/api/notifications', { token: tokens[0] });
    assert.deepEqual(new Set(activity.body.notifications.map(item => item.type)), new Set(['follow', 'like', 'comment']));
    assert.equal(activity.body.unread, 3);
    assert.equal((await call(`/api/notifications/${activity.body.notifications[0].id}/read`, { method: 'PATCH', token: tokens[0] })).status, 200);
    assert.equal((await call('/api/notifications', { token: tokens[0] })).body.unread, 2);
    assert.equal((await call('/api/notifications/read-all', { method: 'POST', token: tokens[0] })).body.unread, 0);
    assert.equal((await call(`/api/gallery/users/${users[0].id}/follow`, { method: 'PUT', token: tokens[2] })).body.followers, 2);
    const followers = await call(`/api/gallery/users/${users[0].id}/followers`);
    assert.equal(followers.status, 200);
    assert.deepEqual(followers.body.users.map(user => user.id).sort(), [String(users[1].id), String(users[2].id)].sort());
    assert.equal(followers.body.hasMore, false);
    assert.ok(followers.body.users.every(user => !('email' in user) && user.username));
    const followingArtists = await call(`/api/gallery/users/${users[1].id}/following`);
    assert.equal(followingArtists.status, 200);
    assert.deepEqual(followingArtists.body.users.map(user => user.id), [String(users[0].id)]);
    assert.ok(!('email' in followingArtists.body.users[0]));
    assert.equal((await call('/api/gallery/users/not-an-id/followers')).status, 404);
    const following = await call('/api/gallery/following', { token: tokens[1] });
    assert.deepEqual(following.body.artworks.map(art => art.id), [publicArt.body.artwork.id]);
    assert.equal((await call(`/api/gallery/${unlistedArt.body.artwork.id}`)).status, 200);
    assert.equal((await call(`/api/gallery/${privateArt.body.artwork.id}`)).status, 404);
    assert.equal((await call(`/api/gallery/users/${users[0].id}/follow`, { method: 'DELETE', token: tokens[1] })).body.followers, 1);
    assert.deepEqual((await call(`/api/gallery/users/${users[0].id}/followers`)).body.users.map(user => user.id), [String(users[2].id)]);
    assert.equal((await call('/api/gallery/following', { token: tokens[1] })).body.artworks.length, 0);
    const extraArtists = await User.create(Array.from({ length: 20 }, (_, index) => ({
      displayName: `Extra Artist ${index}`, email: `extra-social-${index}@example.test`,
      passwordHash, emailVerifiedAt: new Date(),
    })));
    await ArtistFollow.create(extraArtists.map(user => ({ followerId: user.id, artistId: users[0].id })));
    const firstPage = await call(`/api/gallery/users/${users[0].id}/followers?page=1`);
    const secondPage = await call(`/api/gallery/users/${users[0].id}/followers?page=2`);
    assert.equal(firstPage.body.users.length, 20);
    assert.equal(firstPage.body.hasMore, true);
    assert.deepEqual(secondPage.body.users.map(user => user.id), [String(users[2].id)]);
    assert.equal(secondPage.body.hasMore, false);
    assert.equal((await call(`/api/gallery/${publicArt.body.artwork.id}/visibility`, { method: 'PATCH', token: tokens[0],
      body: { visibility: 'private' } })).status, 200);
    assert.equal((await call('/api/gallery/saved', { token: tokens[1] })).body.artworks.length, 0);
    assert.equal((await call(`/api/gallery/${publicArt.body.artwork.id}/bookmark`, { method: 'DELETE', token: tokens[1] })).body.saved, false);
    const privateProfile = await call(`/api/gallery/users/${users[0].id}`);
    assert.equal(privateProfile.body.user.avatarThumbnail, null);
    assert.equal(privateProfile.body.user.featuredArtwork, null);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await new Promise(resolve => server.close(resolve));
  }
});
