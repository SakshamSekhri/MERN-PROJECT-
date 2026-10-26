import mongoose from 'mongoose';
import { ActivityNotification, User } from '../models/index.js';


export async function recordActivity({ recipientId, actorId = null, type, eventKey, artworkId = null }) {
  if (actorId && String(recipientId) === String(actorId)) return;
  try {
    await ActivityNotification.updateOne({ eventKey }, { $setOnInsert: {
      recipientId, actorId, type, eventKey, artworkId,
    } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) console.error('[api] activity notification failed', error);
  }
}

async function listNotifications(userId, page) {
  const rows = await ActivityNotification.find({ recipientId: userId }).sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * 20).limit(21);
  const shown = rows.slice(0, 20);
  const [actors, unread] = await Promise.all([
    User.find({ _id: { $in: shown.map(item => item.actorId).filter(Boolean) } }).select('displayName'),
    ActivityNotification.countDocuments({ recipientId: userId, readAt: null }),
  ]);
  const names = new Map(actors.map(actor => [String(actor.id), actor.displayName]));
  return { notifications: shown.map(item => ({ id: String(item.id), type: item.type,
    actor: item.actorId ? { id: String(item.actorId), displayName: names.get(String(item.actorId)) || 'Artist' } : null,
    artworkId: item.artworkId ? String(item.artworkId) : null,
    readAt: item.readAt, createdAt: item.createdAt })),
  hasMore: rows.length > 20, page, unread };
}

export async function getNotifications(request, response) {
  const page = Math.max(1, Math.min(1000, Number.parseInt(request.query.page, 10) || 1));
  response.json(await listNotifications(request.user.id, page));
}

export async function markNotificationRead(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ error: 'Notification not found' });
  const changed = await ActivityNotification.findOneAndUpdate({ _id: request.params.id, recipientId: request.user.id },
    { $set: { readAt: new Date() } }, { new: true });
  if (!changed) return response.status(404).json({ error: 'Notification not found' });
  response.json({ readAt: changed.readAt });
}

export async function markAllNotificationsRead(request, response) {
  await ActivityNotification.updateMany({ recipientId: request.user.id, readAt: null }, { $set: { readAt: new Date() } });
  response.json({ unread: 0 });
}
