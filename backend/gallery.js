import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from './auth.js';
import { frozenProject, projectThumbnail } from './projectSnapshot.js';
import { Artwork, ArtworkBookmark, ArtworkReaction, ArtworkComment, ArtworkReport, ModerationAction, ArtistFollow, Canvas, User, defaultUsername } from './models/index.js';
import { recordActivity } from './notifications.js';

export const galleryRouter = Router();
const oid = mongoose.isValidObjectId;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const live = { hiddenAt: null, unpublishedAt: null };
const visible = { ...live, visibility: 'public' };
const cleanText = (value, max, required = false) => {
  if (typeof value !== 'string' || value.length > max * 2) fail(400, 'Invalid text');
  const text = value.trim();
  if ((required && !text) || text.length > max) fail(400, 'Invalid text length');
  return text;
};
function cleanTags(value) {
  if (!Array.isArray(value) || value.length > 5 || value.some(tag => typeof tag !== 'string'))
    fail(400, 'Choose up to five tags');
  const tags = value.map(tag => tag.trim().toLowerCase().replace(/^#/, ''));
  if (tags.some(tag => !/^[a-z0-9][a-z0-9-]{1,23}$/.test(tag)) || new Set(tags).size !== tags.length)
    fail(400, 'Tags must be unique and use 2–24 letters, numbers, or hyphens');
  return tags;
}
const visibility = value => ['public', 'unlisted', 'private'].includes(value) ? value : fail(400, 'Invalid visibility');
const usable = (art, user) => art && !art.hiddenAt && !art.unpublishedAt && (art.visibility !== 'private' || String(art.authorId) === String(user?._id));
const canInteract = art => art && !art.hiddenAt && !art.unpublishedAt && art.visibility !== 'private';
const reportKey = (artId, commentId) => `${artId}:${commentId || 'art'}`;
const pageNumber = value => Math.max(1, Math.min(1000, Number.parseInt(value, 10) || 1));
const publicUsername = user => user.username || defaultUsername(user.displayName, user.id);
const verifiedArtist = async id => oid(id) ? User.findOne({ _id: id, emailVerifiedAt: { $type: 'date' } }).select('displayName username bio avatarArtworkId featuredArtworkId createdAt') : null;
const profileCard = (user, avatarThumbnail = null) => ({ id: String(user.id), displayName: user.displayName,
  username: publicUsername(user), bio: user.bio || '', joinedAt: user.createdAt, avatarThumbnail });
async function profileCards(users) {
  const ids = users.map(user => user.avatarArtworkId).filter(Boolean);
  const arts = ids.length ? await Artwork.find({ _id: { $in: ids }, ...visible }).select('authorId thumbnail') : [];
  const byId = new Map(arts.map(art => [String(art.id), art]));
  return users.map(user => {
    const art = byId.get(String(user.avatarArtworkId));
    return profileCard(user, art && String(art.authorId) === String(user.id) ? art.thumbnail : null);
  });
}

function summary(art) {
  return { id: String(art._id), title: art.title, description: art.description, tags: art.tags || [], author: { id: String(art.authorId), displayName: art.contributors[0]?.displayName || 'Artist' },
    contributors: art.contributors.map(person => ({ id: String(person.userId), displayName: person.displayName, changes: person.changes })),
    visibility: art.visibility, source: art.source, thumbnail: art.thumbnail, coverFrameId: art.coverFrameId, gridSize: art.project.gridSize,
    frames: art.project.frames.length, example: Boolean(art.example), likes: art.likes, dislikes: art.dislikes, commentCount: art.commentCount,
    createdAt: art.createdAt, hidden: Boolean(art.hiddenAt), unpublished: Boolean(art.unpublishedAt) };
}

async function publicProfile(id) {
  const user = await verifiedArtist(id);
  if (!user) fail(404, 'Artist not found');
  const [followers, following, created, cards, featured] = await Promise.all([
    ArtistFollow.countDocuments({ artistId: user.id }),
    ArtistFollow.countDocuments({ followerId: user.id }),
    Artwork.countDocuments({ ...visible, authorId: user.id }),
    profileCards([user]),
    user.featuredArtworkId ? Artwork.findOne({ _id: user.featuredArtworkId, authorId: user.id, ...visible }).select('title thumbnail') : null,
  ]);
  return { ...cards[0], avatarArtworkId: user.avatarArtworkId ? String(user.avatarArtworkId) : null,
    featuredArtworkId: user.featuredArtworkId ? String(user.featuredArtworkId) : null,
    featuredArtwork: featured ? { id: String(featured.id), title: featured.title, thumbnail: featured.thumbnail } : null,
    followers, following, created };
}

galleryRouter.get('/users/search', async (request, response) => {
  const query = cleanText(request.query.q || '', 40);
  if (query.length < 2) return response.json({ users: [] });
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = { emailVerifiedAt: { $type: 'date' }, $or: [
    { username: { $regex: escaped, $options: 'i' } },
    { displayName: { $regex: escaped, $options: 'i' } },
  ] };
  const results = await User.find(filter).select('displayName username bio avatarArtworkId createdAt').limit(40);
  const lower = query.toLowerCase();
  results.sort((a, b) => {
    const rank = user => publicUsername(user).toLowerCase() === lower ? 0
      : publicUsername(user).toLowerCase().startsWith(lower) ? 1
        : user.displayName.toLowerCase().startsWith(lower) ? 2 : 3;
    return rank(a) - rank(b) || a.displayName.localeCompare(b.displayName);
  });
  response.json({ users: await profileCards(results.slice(0, 20)) });
});

galleryRouter.get('/users/me/artwork-choices', requireAuth, async (request, response) => {
  const works = await Artwork.find({ authorId: request.user.id, ...visible }).select('title thumbnail')
    .sort({ createdAt: -1, _id: -1 }).limit(200);
  response.json({ artworks: works.map(art => ({ id: String(art.id), title: art.title, thumbnail: art.thumbnail })) });
});

galleryRouter.patch('/users/me', requireAuth, async (request, response) => {
  const payload = request.body || {};
  const username = request.body?.username;
  const bio = request.body?.bio;
  if (typeof username !== 'string' || !/^[a-z0-9_]{3,24}$/.test(username.trim().toLowerCase()) ||
      (username.trim().toLowerCase().startsWith('pv_') && username.trim().toLowerCase() !== request.user.username))
    fail(400, 'Username must be 3–24 letters, numbers, or underscores, and cannot start with pv_');
  if (typeof bio !== 'string') fail(400, 'Invalid bio');
  const cleanBio = cleanText(bio, 280);
  const cleanUsername = username.trim().toLowerCase();
  const updates = { username: cleanUsername, bio: cleanBio };
  for (const field of ['avatarArtworkId', 'featuredArtworkId']) {
    if (!Object.hasOwn(payload, field)) continue;
    const value = payload[field];
    if (value !== null && (typeof value !== 'string' || !oid(value) ||
      !await Artwork.exists({ _id: value, authorId: request.user.id, ...visible })))
      fail(400, 'Choose one of your public artworks');
    updates[field] = value;
  }
  try {
    await User.updateOne({ _id: request.user.id }, { $set: updates });
  } catch (error) {
    if (error.code === 11000) fail(409, 'That username is already taken');
    throw error;
  }
  response.json({ user: await publicProfile(request.user.id) });
});

galleryRouter.get('/users/:id', async (request, response) => {
  const user = await publicProfile(request.params.id);
  const page = pageNumber(request.query.page);
  const works = await Artwork.find({ ...visible, authorId: user.id }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 24).limit(25);
  response.json({ user, artworks: works.slice(0, 24).map(summary), hasMore: works.length > 24, page, tab: 'created' });
});

for (const kind of ['followers', 'following']) {
  galleryRouter.get(`/users/:id/${kind}`, async (request, response) => {
    const artist = await verifiedArtist(request.params.id);
    if (!artist) fail(404, 'Artist not found');
    const page = pageNumber(request.query.page);
    const filter = kind === 'followers' ? { artistId: artist.id } : { followerId: artist.id };
    const personKey = kind === 'followers' ? 'followerId' : 'artistId';
    const follows = await ArtistFollow.find(filter).select(personKey)
      .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 20).limit(21);
    const ids = follows.slice(0, 20).map(follow => follow[personKey]);
    const users = await User.find({ _id: { $in: ids }, emailVerifiedAt: { $type: 'date' } })
      .select('displayName username bio avatarArtworkId createdAt');
    const byId = new Map(users.map(user => [String(user.id), user]));
    response.json({ users: await profileCards(ids.map(id => byId.get(String(id))).filter(Boolean)),
      hasMore: follows.length > 20, page });
  });
}

galleryRouter.get('/users/me/following-ids', requireAuth, async (request, response) => {
  const ids = String(request.query.ids || '').split(',').filter(oid).slice(0, 40);
  const follows = await ArtistFollow.find({ followerId: request.user.id, artistId: { $in: ids } }).select('artistId');
  response.json({ ids: follows.map(follow => String(follow.artistId)) });
});

galleryRouter.get('/users/:id/follow', requireAuth, async (request, response) => {
  const user = await publicProfile(request.params.id);
  const followed = Boolean(await ArtistFollow.exists({ followerId: request.user.id, artistId: user.id }));
  response.json({ following: followed, followers: user.followers });
});

galleryRouter.put('/users/:id/follow', requireAuth, async (request, response) => {
  const artist = await verifiedArtist(request.params.id);
  if (!artist) fail(404, 'Artist not found');
  if (String(artist.id) === String(request.user.id)) fail(403, 'You cannot follow yourself');
  const filter = { followerId: request.user.id, artistId: artist.id };
  if (!await ArtistFollow.exists(filter) && await ArtistFollow.countDocuments({ followerId: request.user.id }) >= 1000)
    fail(403, 'Follow limit reached');
  try {
    const result = await ArtistFollow.updateOne(filter, { $setOnInsert: filter }, { upsert: true });
    if (result.upsertedCount) await recordActivity({ recipientId: artist.id, actorId: request.user.id,
      type: 'follow', eventKey: `follow:${request.user.id}:${artist.id}` });
  }
  catch (error) { if (error.code !== 11000) throw error; }
  response.json({ following: true, followers: await ArtistFollow.countDocuments({ artistId: artist.id }) });
});

galleryRouter.delete('/users/:id/follow', requireAuth, async (request, response) => {
  const artist = await verifiedArtist(request.params.id);
  if (!artist) fail(404, 'Artist not found');
  await ArtistFollow.deleteOne({ followerId: request.user.id, artistId: artist.id });
  response.json({ following: false, followers: await ArtistFollow.countDocuments({ artistId: artist.id }) });
});

galleryRouter.get('/following', requireAuth, async (request, response) => {
  const page = pageNumber(request.query.page);
  const follows = await ArtistFollow.find({ followerId: request.user.id }).select('artistId');
  const ids = follows.map(follow => follow.artistId);
  const works = ids.length ? await Artwork.find({ ...visible, authorId: { $in: ids } })
    .sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 24).limit(25) : [];
  response.json({ artworks: works.slice(0, 24).map(summary), hasMore: works.length > 24, page, followingCount: ids.length });
});

galleryRouter.get('/moderation/reports', requireAuth, async (request, response) => {
  if (!request.user.moderator) fail(403, 'Moderator access required');
  const reports = await ArtworkReport.find({ status: 'open' }).sort({ createdAt: -1 }).limit(100);
  const artworks = await Artwork.find({ _id: { $in: reports.map(report => report.artworkId) } }).select('title thumbnail');
  const comments = await ArtworkComment.find({ _id: { $in: reports.filter(report => report.commentId).map(report => report.commentId) } }).select('text authorName');
  const byArt = new Map(artworks.map(art => [String(art.id), art]));
  const byComment = new Map(comments.map(comment => [String(comment.id), comment]));
  response.json({ reports: reports.map(report => ({ id: String(report.id), artworkId: String(report.artworkId), commentId: report.commentId ? String(report.commentId) : null,
    artworkTitle: byArt.get(String(report.artworkId))?.title || 'Removed artwork',
    commentText: report.commentId ? byComment.get(String(report.commentId))?.text || 'Removed comment' : null,
    reason: report.reason, reporterId: String(report.reporterId), createdAt: report.createdAt })) });
});

galleryRouter.post('/moderation/reports/:id', requireAuth, async (request, response) => {
  if (!request.user.moderator) fail(403, 'Moderator access required');
  if (!oid(request.params.id)) fail(404, 'Report not found');
  const action = request.body?.action;
  if (!['hide', 'restore', 'dismiss'].includes(action)) fail(400, 'Invalid moderation action');
  const report = await ArtworkReport.findById(request.params.id);
  if (!report) fail(404, 'Report not found');
  const target = report.commentId ? await ArtworkComment.findById(report.commentId) : await Artwork.findById(report.artworkId);
  if (!target) fail(404, 'Reported content not found');
  if (action !== 'dismiss') {
    const wasVisible = !target.hiddenAt && !target.deletedAt;
    target.hiddenAt = action === 'hide' ? new Date() : null;
    await target.save();
    const nowVisible = !target.hiddenAt && !target.deletedAt;
    if (report.commentId && wasVisible !== nowVisible) await Artwork.updateOne({ _id: report.artworkId }, { $inc: { commentCount: nowVisible ? 1 : -1 } });
  }
  await ArtworkReport.updateMany({ targetKey: report.targetKey, status: 'open' }, { $set: { status: action === 'dismiss' ? 'dismissed' : 'actioned' } });
  await ModerationAction.create({ moderatorId: request.user.id, artworkId: report.artworkId, commentId: report.commentId, action,
    reason: cleanText(request.body?.reason || '', 500) });
  response.json({ status: action });
});

galleryRouter.get('/', async (request, response) => {
  const page = pageNumber(request.query.page);
  const query = cleanText(request.query.q || '', 60).toLowerCase();
  const tag = request.query.tag ? cleanTags([request.query.tag])[0] : null;
  const sort = request.query.sort === 'trending' ? { likes: -1, createdAt: -1, _id: -1 } : { createdAt: -1, _id: -1 };
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = { ...visible, ...(tag ? { tags: tag } : {}), ...(query ? { $or: [
    { title: { $regex: escaped, $options: 'i' } },
    { description: { $regex: escaped, $options: 'i' } },
    { tags: { $regex: escaped, $options: 'i' } },
  ] } : {}) };
  const works = await Artwork.find(filter).sort(sort).skip((page - 1) * 24).limit(25);
  response.json({ artworks: works.slice(0, 24).map(summary), hasMore: works.length > 24, page });
});

galleryRouter.get('/saved', requireAuth, async (request, response) => {
  const page = pageNumber(request.query.page);
  const rows = await ArtworkBookmark.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(request.user.id) } },
    { $sort: { createdAt: -1, _id: -1 } },
    { $lookup: { from: 'artworks', localField: 'artworkId', foreignField: '_id', as: 'art' } },
    { $unwind: '$art' },
    { $match: { 'art.visibility': { $in: ['public', 'unlisted'] }, 'art.hiddenAt': null, 'art.unpublishedAt': null } },
    { $skip: (page - 1) * 24 }, { $limit: 25 },
  ]);
  response.json({ artworks: rows.slice(0, 24).map(row => summary(row.art)), hasMore: rows.length > 24, page });
});

galleryRouter.post('/', requireAuth, async (request, response) => {
  const title = cleanText(request.body?.title, 120, true);
  const description = cleanText(request.body?.description ?? '', 2000);
  const tags = cleanTags(request.body?.tags ?? []);
  const access = visibility(request.body?.visibility ?? 'public');
  let project, source, contributors = [{ userId: request.user._id, displayName: request.user.displayName, changes: 0 }];
  if (request.body?.projectId) {
    const canvas = oid(request.body.projectId) && await Canvas.findOne({ _id: request.body.projectId, ownerId: request.user.id });
    if (!canvas) fail(404, 'Cloud project not found');
    project = frozenProject(canvas.checkpoint);
    source = { kind: 'project', canvasId: canvas._id };
  } else {
    project = frozenProject(request.body?.project);
    source = { kind: 'local' };
  }
  const coverFrameId = request.body?.coverFrameId ?? project.frames[project.activeFrame].id;
  if (!project.frames.some(frame => frame.id === coverFrameId)) fail(400, 'Cover frame not found');
  const art = await Artwork.create({ authorId: request.user.id, title, description, tags, visibility: access, source, contributors,
    project, coverFrameId, thumbnail: projectThumbnail(project, coverFrameId) });
  response.status(201).json({ artwork: summary(art) });
});

galleryRouter.get('/:id', (request, response, next) => request.headers.authorization ? requireAuth(request, response, next) : next(), async (request, response) => {
  if (!oid(request.params.id)) fail(404, 'Artwork not found');
  const art = await Artwork.findById(request.params.id);
  if (!usable(art, request.user)) fail(404, 'Artwork not found');
  response.json({ artwork: { ...summary(art), project: art.project } });
});

galleryRouter.get('/:id/owner', requireAuth, async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findOne({ _id: request.params.id, authorId: request.user.id });
  if (!art) fail(404, 'Artwork not found');
  response.json({ artwork: summary(art) });
});

galleryRouter.patch('/:id/visibility', requireAuth, async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findOne({ _id: request.params.id, authorId: request.user.id, unpublishedAt: null });
  if (!art) fail(404, 'Artwork not found');
  art.visibility = visibility(request.body?.visibility);
  await art.save();
  response.json({ artwork: summary(art) });
});

galleryRouter.patch('/:id/tags', requireAuth, async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findOne({ _id: request.params.id, authorId: request.user.id, unpublishedAt: null });
  if (!art) fail(404, 'Artwork not found');
  art.tags = cleanTags(request.body?.tags);
  await art.save();
  response.json({ artwork: summary(art) });
});

galleryRouter.get('/:id/bookmark', requireAuth, async (request, response) => {
  if (!oid(request.params.id)) fail(404, 'Artwork not found');
  const art = await Artwork.findById(request.params.id);
  if (!canInteract(art)) fail(404, 'Artwork not found');
  response.json({ saved: Boolean(await ArtworkBookmark.exists({ artworkId: art.id, userId: request.user.id })) });
});

galleryRouter.put('/:id/bookmark', requireAuth, async (request, response) => {
  if (!oid(request.params.id)) fail(404, 'Artwork not found');
  const art = await Artwork.findById(request.params.id);
  if (!canInteract(art)) fail(404, 'Artwork not found');
  if (!await ArtworkBookmark.exists({ artworkId: art.id, userId: request.user.id }) &&
      await ArtworkBookmark.countDocuments({ userId: request.user.id }) >= 1000) fail(403, 'Saved art limit reached');
  try { await ArtworkBookmark.updateOne({ artworkId: art.id, userId: request.user.id },
    { $setOnInsert: { artworkId: art.id, userId: request.user.id } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  response.json({ saved: true });
});

galleryRouter.delete('/:id/bookmark', requireAuth, async (request, response) => {
  if (!oid(request.params.id)) fail(404, 'Artwork not found');
  await ArtworkBookmark.deleteOne({ artworkId: request.params.id, userId: request.user.id });
  response.json({ saved: false });
});

galleryRouter.post('/:id/unpublish', requireAuth, async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findOneAndUpdate({ _id: request.params.id, authorId: request.user.id, unpublishedAt: null },
    { $set: { unpublishedAt: new Date() } }, { new: true });
  if (!art) fail(404, 'Artwork not found');
  response.json({ artwork: summary(art) });
});

galleryRouter.get('/:id/reaction', requireAuth, async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findById(request.params.id);
  if (!usable(art, request.user)) fail(404, 'Artwork not found');
  const reaction = await ArtworkReaction.findOne({ artworkId: art.id, userId: request.user.id });
  response.json({ value: reaction?.value || null });
});

galleryRouter.put('/:id/reaction', requireAuth, async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findById(request.params.id);
  if (!canInteract(art)) fail(404, 'Artwork not found');
  if (String(art.authorId) === String(request.user.id)) fail(403, 'You cannot react to your own artwork');
  const value = request.body?.value;
  if (![null, 'like', 'dislike'].includes(value)) fail(400, 'Invalid reaction');
  const filter = { artworkId: art.id, userId: request.user.id };
  let newLike = false;
  // A conditional update handles retries, while the unique index prevents duplicate votes.
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await ArtworkReaction.findOne(filter);
    if (existing?.value === value || (!existing && value === null)) break;
    try {
      if (existing) {
        const changed = value === null ? await ArtworkReaction.deleteOne({ ...filter, value: existing.value })
          : await ArtworkReaction.updateOne({ ...filter, value: existing.value }, { $set: { value } });
        if (!changed.modifiedCount && !changed.deletedCount) continue;
      } else await ArtworkReaction.create({ ...filter, value });
      const inc = { likes: (value === 'like' ? 1 : 0) - (existing?.value === 'like' ? 1 : 0),
        dislikes: (value === 'dislike' ? 1 : 0) - (existing?.value === 'dislike' ? 1 : 0) };
      await Artwork.updateOne({ _id: art.id }, { $inc: inc });
      newLike = value === 'like' && existing?.value !== 'like';
      break;
    } catch (error) { if (error.code !== 11000 || attempt === 2) throw error; }
  }
  const updated = await Artwork.findById(art.id);
  const current = await ArtworkReaction.findOne(filter);
  if (newLike && current?.value === 'like') await recordActivity({ recipientId: art.authorId, actorId: request.user.id,
    type: 'like', eventKey: `like:${request.user.id}:${art.id}`, artworkId: art.id });
  response.json({ value: current?.value || null, likes: updated.likes, dislikes: updated.dislikes });
});

galleryRouter.get('/:id/comments', async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findById(request.params.id);
  if (!usable(art)) fail(404, 'Artwork not found');
  const before = request.query.before;
  if (before && !oid(before)) fail(400, 'Invalid comment cursor');
  const filter = { artworkId: art.id, hiddenAt: null, deletedAt: null, ...(before ? { _id: { $lt: before } } : {}) };
  const comments = await ArtworkComment.find(filter).sort({ _id: -1 }).limit(21);
  response.json({ comments: comments.slice(0, 20).map(comment => ({ id: String(comment.id), author: { id: String(comment.authorId), displayName: comment.authorName }, text: comment.text, createdAt: comment.createdAt })),
    nextBefore: comments.length > 20 ? String(comments[19].id) : null });
});

galleryRouter.post('/:id/comments', requireAuth, async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findById(request.params.id);
  if (!canInteract(art)) fail(404, 'Artwork not found');
  const text = cleanText(request.body?.text, 1000, true);
  const comment = await ArtworkComment.create({ artworkId: art.id, authorId: request.user.id, authorName: request.user.displayName, text });
  await Artwork.updateOne({ _id: art.id }, { $inc: { commentCount: 1 } });
  await recordActivity({ recipientId: art.authorId, actorId: request.user.id, type: 'comment',
    eventKey: `comment:${comment.id}`, artworkId: art.id });
  response.status(201).json({ comment: { id: String(comment.id), text, author: { id: String(request.user.id), displayName: request.user.displayName }, createdAt: comment.createdAt } });
});

galleryRouter.delete('/:id/comments/:commentId', requireAuth, async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findById(request.params.id);
  if (!art || !oid(request.params.commentId)) fail(404, 'Comment not found');
  const comment = await ArtworkComment.findOne({ _id: request.params.commentId, artworkId: art.id, deletedAt: null });
  if (!comment) fail(404, 'Comment not found');
  if (![String(comment.authorId), String(art.authorId)].includes(String(request.user.id)) && !request.user.moderator) fail(403, 'Cannot remove this comment');
  comment.deletedAt = new Date();
  await comment.save();
  if (!comment.hiddenAt) await Artwork.updateOne({ _id: art.id }, { $inc: { commentCount: -1 } });
  response.status(204).end();
});

galleryRouter.post('/:id/reports', requireAuth, async (request, response) => {
  const art = oid(request.params.id) && await Artwork.findById(request.params.id);
  if (!canInteract(art)) fail(404, 'Artwork not found');
  const reason = request.body?.reason;
  if (!['spam', 'abuse', 'other'].includes(reason)) fail(400, 'Invalid report reason');
  const commentId = request.body?.commentId || null;
  let target = art;
  if (commentId) {
    if (!oid(commentId)) fail(404, 'Comment not found');
    target = await ArtworkComment.findOne({ _id: commentId, artworkId: art.id, deletedAt: null, hiddenAt: null });
    if (!target) fail(404, 'Comment not found');
  }
  if (String(commentId ? target.authorId : art.authorId) === String(request.user.id)) fail(403, 'You cannot report your own content');
  const key = reportKey(art.id, commentId);
  const existing = await ArtworkReport.findOne({ targetKey: key, reporterId: request.user.id });
  if (existing) fail(409, 'You already reported this content');
  await ArtworkReport.create({ artworkId: art.id, commentId, targetKey: key, reporterId: request.user.id, reason });
  const count = await ArtworkReport.countDocuments({ targetKey: key, status: 'open' });
  await (commentId ? ArtworkComment : Artwork).updateOne({ _id: target.id }, { $set: { reportCount: count } });
  if (count >= 3) {
    const hidden = await (commentId ? ArtworkComment : Artwork).updateOne({ _id: target.id, hiddenAt: null }, { $set: { hiddenAt: new Date() } });
    if (commentId && hidden.modifiedCount) await Artwork.updateOne({ _id: art.id }, { $inc: { commentCount: -1 } });
  }
  response.status(201).json({ message: 'Report received', hidden: count >= 3 });
});
