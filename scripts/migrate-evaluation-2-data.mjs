import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { indexedModels } from '../backend/models/index.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: process.env.E2_ENV_FILE || '.env.e2' });

const sourceUri = process.env.MONGO_URI;
const { E2_MONGO_USER: targetUser, E2_MONGO_PASSWORD: targetPassword,
  E2_MONGO_HOST: targetHost, E2_MONGO_DB: targetDatabase } = process.env;
if (!sourceUri || !targetUser || !targetPassword || !targetHost || !targetDatabase)
  throw new Error('Source and Evaluation 2 database settings are required');
const targetUri = `mongodb+srv://${encodeURIComponent(targetUser)}:${encodeURIComponent(targetPassword)}` +
  `@${targetHost}/${encodeURIComponent(targetDatabase)}?retryWrites=true&w=majority&authSource=admin`;
const sourceUrl = new URL(sourceUri);
const targetUrl = new URL(targetUri);
if (sourceUrl.protocol !== 'mongodb+srv:' || targetUrl.protocol !== 'mongodb+srv:' ||
    !sourceUrl.hostname.endsWith('.mongodb.net') || !targetUrl.hostname.endsWith('.mongodb.net') ||
    sourceUrl.hostname === targetUrl.hostname || sourceUrl.pathname !== '/pixelverse' ||
    targetUrl.pathname !== '/pixelverse_2') {
  throw new Error('Expected separate Atlas clusters with pixelverse source and pixelverse_2 destination');
}

async function connect(uri, options) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await mongoose.createConnection(uri, { serverSelectionTimeoutMS: 30000, ...options }).asPromise(); }
    catch (error) { lastError = error; }
  }
  throw lastError;
}

const source = await connect(sourceUri);
let target;
try {
  target = await connect(targetUri, { autoIndex: false });
  const sourceDb = source.db;
  const targetDb = target.db;
  const names = indexedModels.map(model => model.collection.name);
  const sourceNames = new Set((await sourceDb.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name));
  if (names.some(name => !sourceNames.has(name))) throw new Error('Source is missing an Evaluation 2 collection');
  const targetNames = new Set((await targetDb.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name));
  if ([...targetNames].some(name => !names.includes(name)))
    throw new Error('Destination has an unexpected collection; no data was copied');

  const EJSON = mongoose.mongo.BSON.EJSON;
  const copied = [];
  for (const name of names) {
    const destination = targetNames.has(name) ? targetDb.collection(name) : await targetDb.createCollection(name);
    const sourceHash = createHash('sha256');
    let batch = [];
    let count = 0;
    for await (const document of sourceDb.collection(name).find({}).sort({ _id: 1 })) {
      sourceHash.update(`${EJSON.stringify(document, { relaxed: false })}\n`);
      batch.push({ replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true } });
      if (batch.length === 100) {
        await destination.bulkWrite(batch, { ordered: true });
        count += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await destination.bulkWrite(batch, { ordered: true });
      count += batch.length;
    }
    copied.push({ name, count, hash: sourceHash.digest('hex') });
    console.log(`${name}: ${count}`);
  }

  for (const entry of copied) {
    for (const db of [sourceDb, targetDb]) {
      const hash = createHash('sha256');
      let count = 0;
      for await (const document of db.collection(entry.name).find({}).sort({ _id: 1 })) {
        hash.update(`${EJSON.stringify(document, { relaxed: false })}\n`);
        count += 1;
      }
      if (count !== entry.count || hash.digest('hex') !== entry.hash)
        throw new Error(`Data changed or verification failed: ${entry.name}`);
    }
  }

  for (const model of indexedModels) await target.model(model.modelName, model.schema).createIndexes();
  console.log(`Verified ${copied.reduce((sum, entry) => sum + entry.count, 0)} documents across ${copied.length} Evaluation 2 collections`);
} finally {
  await target?.close();
  await source.close();
}
