import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export function defaultUsername(displayName, id) {
  const name = String(displayName || '').normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 8) || 'artist';
  return `pv_${name}_${String(id).slice(-10)}`;
}

const userSchema = new Schema({
  displayName: { type: String, required: true, maxlength: 80 },
  username: { type: String, lowercase: true, trim: true, maxlength: 24 },
  bio: { type: String, default: '', maxlength: 280 },
  avatarArtworkId: { type: Schema.Types.ObjectId, ref: 'Artwork', default: null },
  featuredArtworkId: { type: Schema.Types.ObjectId, ref: 'Artwork', default: null },
  email: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, select: false },
  googleSubject: { type: String, select: false },
  emailVerifiedAt: { type: Date, default: null },
  moderator: { type: Boolean, default: false },
}, { timestamps: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } } });
userSchema.index({ googleSubject: 1 }, { unique: true, sparse: true });
userSchema.pre('validate', function () {
  if (this.isNew && !this.username) this.username = defaultUsername(this.displayName, this._id);
});

const artistFollowSchema = new Schema({
  followerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  artistId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
artistFollowSchema.index({ followerId: 1, artistId: 1 }, { unique: true });
artistFollowSchema.index({ artistId: 1, followerId: 1 });

const activityNotificationSchema = new Schema({
  recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  type: { type: String, enum: ['follow', 'like', 'comment'], required: true },
  eventKey: { type: String, required: true },
  artworkId: { type: Schema.Types.ObjectId, ref: 'Artwork', default: null },
  readAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
activityNotificationSchema.index({ eventKey: 1 }, { unique: true });
activityNotificationSchema.index({ recipientId: 1, createdAt: -1 });
activityNotificationSchema.index({ recipientId: 1, readAt: 1 });

const canvasSchema = new Schema({
  title: { type: String, default: 'Untitled', maxlength: 120 },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  gridSize: { type: Number, enum: [16, 32, 64, 128], required: true },
  frameIds: [{ type: Number, required: true }],
  checkpoint: { type: Schema.Types.Mixed, required: true },
  visibility: { type: String, enum: ['private', 'unlisted', 'public'], default: 'private' },
}, { timestamps: true });
canvasSchema.index({ ownerId: 1, updatedAt: -1 });
canvasSchema.index({ visibility: 1, updatedAt: -1 });
const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const oneTimeTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true },
  purpose: { type: String, enum: ['verify', 'reset', 'google-transfer', 'google-link'], required: true },
  audienceOrigin: { type: String, default: null },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true });
oneTimeTokenSchema.index({ tokenHash: 1, purpose: 1 }, { unique: true });
oneTimeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
oneTimeTokenSchema.index({ userId: 1, purpose: 1, usedAt: 1 });

const artworkSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 2000 },
  tags: [{ type: String, lowercase: true, trim: true, maxlength: 24 }],
  visibility: { type: String, enum: ['public', 'unlisted', 'private'], default: 'public' },
  source: { kind: { type: String, enum: ['local', 'project'], required: true }, canvasId: Schema.Types.ObjectId },
  contributors: [{ userId: { type: Schema.Types.ObjectId, ref: 'User' }, displayName: { type: String, required: true }, changes: { type: Number, default: 0 } }],
  project: { type: Schema.Types.Mixed, required: true },
  coverFrameId: { type: Number, required: true },
  thumbnail: { type: String, required: true },
  example: { type: Boolean, default: false },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  reportCount: { type: Number, default: 0 },
  hiddenAt: { type: Date, default: null },
  unpublishedAt: { type: Date, default: null },
}, { timestamps: true });
artworkSchema.index({ visibility: 1, hiddenAt: 1, unpublishedAt: 1, createdAt: -1 });
artworkSchema.index({ authorId: 1, createdAt: -1 });
artworkSchema.index({ visibility: 1, likes: -1, createdAt: -1 });
artworkSchema.index({ tags: 1, visibility: 1, createdAt: -1 });

const artworkBookmarkSchema = new Schema({
  artworkId: { type: Schema.Types.ObjectId, ref: 'Artwork', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
artworkBookmarkSchema.index({ artworkId: 1, userId: 1 }, { unique: true });
artworkBookmarkSchema.index({ userId: 1, createdAt: -1 });

const artworkReactionSchema = new Schema({
  artworkId: { type: Schema.Types.ObjectId, ref: 'Artwork', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  value: { type: String, enum: ['like', 'dislike'], required: true },
}, { timestamps: true });
artworkReactionSchema.index({ artworkId: 1, userId: 1 }, { unique: true });

const artworkCommentSchema = new Schema({
  artworkId: { type: Schema.Types.ObjectId, ref: 'Artwork', required: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  text: { type: String, required: true, maxlength: 1000 },
  hiddenAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  reportCount: { type: Number, default: 0 },
}, { timestamps: true });
artworkCommentSchema.index({ artworkId: 1, _id: -1 });

const artworkReportSchema = new Schema({
  artworkId: { type: Schema.Types.ObjectId, ref: 'Artwork', required: true },
  commentId: { type: Schema.Types.ObjectId, ref: 'ArtworkComment', default: null },
  targetKey: { type: String, required: true },
  reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, enum: ['spam', 'abuse', 'other'], required: true },
  status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open' },
}, { timestamps: true });
artworkReportSchema.index({ targetKey: 1, reporterId: 1 }, { unique: true });
artworkReportSchema.index({ status: 1, createdAt: -1 });

const moderationActionSchema = new Schema({
  moderatorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  artworkId: { type: Schema.Types.ObjectId, ref: 'Artwork', required: true },
  commentId: { type: Schema.Types.ObjectId, ref: 'ArtworkComment', default: null },
  action: { type: String, enum: ['hide', 'restore', 'dismiss'], required: true },
  reason: { type: String, default: '', maxlength: 500 },
}, { timestamps: true });
moderationActionSchema.index({ artworkId: 1, createdAt: -1 });

export const User = model('User', userSchema);
export const ArtistFollow = model('ArtistFollow', artistFollowSchema);
export const ActivityNotification = model('ActivityNotification', activityNotificationSchema);
export const Canvas = model('Canvas', canvasSchema);
export const Session = model('Session', sessionSchema);
export const OneTimeToken = model('OneTimeToken', oneTimeTokenSchema);
export const Artwork = model('Artwork', artworkSchema);
export const ArtworkBookmark = model('ArtworkBookmark', artworkBookmarkSchema);
export const ArtworkReaction = model('ArtworkReaction', artworkReactionSchema);
export const ArtworkComment = model('ArtworkComment', artworkCommentSchema);
export const ArtworkReport = model('ArtworkReport', artworkReportSchema);
export const ModerationAction = model('ModerationAction', moderationActionSchema);

export const indexedModels = [User, ArtistFollow, ActivityNotification, Canvas, Session, OneTimeToken, Artwork, ArtworkBookmark, ArtworkReaction, ArtworkComment, ArtworkReport, ModerationAction];
