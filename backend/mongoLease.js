import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

const leaseSchema = new mongoose.Schema({
  _id: String,
  token: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
const MutationLease = mongoose.model('MutationLease', leaseSchema);

const LEASE_MS = 90_000;
const WAIT_MS = 20_000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// The lock lives in MongoDB so separate Vercel function instances serialize
// edits to the same room or challenge, while unrelated work proceeds normally.
export async function withMongoLease(key, work) {
  const token = randomUUID();
  const deadline = Date.now() + WAIT_MS;
  while (true) {
    const now = new Date();
    try {
      const lease = await MutationLease.findOneAndUpdate({ _id: key,
        $or: [{ expiresAt: { $lte: now } }, { expiresAt: { $exists: false } }] },
      { $set: { token, expiresAt: new Date(Date.now() + LEASE_MS) } },
      { upsert: true, new: true });
      if (lease?.token === token) break;
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    if (Date.now() >= deadline) throw Object.assign(new Error('This artwork is busy. Try again.'), { status: 503 });
    await sleep(80 + Math.floor(Math.random() * 50));
  }

  let renewal = Promise.resolve();
  let renewalError;
  const timer = setInterval(() => {
    renewal = renewal.then(async () => {
      const result = await MutationLease.updateOne({ _id: key, token },
        { $set: { expiresAt: new Date(Date.now() + LEASE_MS) } });
      if (!result.matchedCount) throw new Error('The artwork lock expired');
    }).catch(error => { renewalError = error; });
  }, 15_000);
  timer.unref?.();
  try {
    const result = await work();
    if (renewalError) throw renewalError;
    return result;
  } finally {
    clearInterval(timer);
    await renewal;
    await MutationLease.deleteOne({ _id: key, token });
  }
}
