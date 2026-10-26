import 'dotenv/config';
import mongoose from 'mongoose';
import { User } from '../backend/models/index.js';
import { normalizeEmail } from '../backend/security.js';

const [action, rawEmail] = process.argv.slice(2);
const email = normalizeEmail(rawEmail);
if (!['--grant', '--revoke'].includes(action) || !email)
  throw new Error('Usage: npm run moderator -- --grant|--revoke verified@example.com');
if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required');
await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
try {
  const user = await User.findOne({ email });
  if (!user) throw new Error('Account not found');
  if (!user.emailVerifiedAt) throw new Error('Verify the account before granting moderator access');
  user.moderator = action === '--grant';
  await user.save();
  console.log(`Moderator access ${user.moderator ? 'granted' : 'revoked'} for ${user.email}`);
} finally { await mongoose.disconnect(); }
