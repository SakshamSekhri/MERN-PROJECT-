import mongoose from 'mongoose';
import { app } from './app.js';
import { config } from './config.js';
import { indexedModels, User, defaultUsername } from './models/index.js';
import { authConfigured } from './security.js';
import { productionIssues } from './productionCheck.js';

if (process.env.NODE_ENV === 'production') {
  const issues = productionIssues(config);
  if (issues.length) throw new Error(`Production configuration is incomplete: ${issues.join('; ')}`);
}

if (config.mongoUri) {
  if (!authConfigured()) throw new Error('JWT_SECRET must contain at least 32 characters before starting the database-backed API');
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000, autoIndex: false });
    await Promise.all(indexedModels.map(item => item.createIndexes()));
    let handlesAdded = 0;
    for await (const user of User.find({ $or: [{ username: { $exists: false } }, { username: null }, { username: '' }] })
      .select('displayName').cursor()) {
      const missing = { _id: user.id, $or: [{ username: { $exists: false } }, { username: null }, { username: '' }] };
      try {
        const updated = await User.updateOne(missing, { $set: { username: defaultUsername(user.displayName, user.id) } });
        handlesAdded += updated.modifiedCount;
      } catch (error) {
        if (error.code !== 11000) throw error;
        const updated = await User.updateOne(missing, { $set: { username: `pv_${String(user.id).slice(3)}` } });
        handlesAdded += updated.modifiedCount;
      }
    }
    if (handlesAdded) console.log(`[api] assigned usernames to ${handlesAdded} existing accounts`);
    console.log('[api] MongoDB connected; indexes ready');
  } catch (error) {
    console.error('[api] MongoDB connection failed:', error.message);
    process.exitCode = 1;
    await mongoose.disconnect();
    process.exit();
  }
} else {
  console.warn('[api] MONGO_URI missing; health will report disconnected');
}

const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';
const server = app.listen(config.port, host, () => console.log(`[api] listening on ${host}:${config.port}`));
async function shutdown() {
  server.close();
  await mongoose.disconnect();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
