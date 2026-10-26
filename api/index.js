import mongoose from 'mongoose';
import { app } from '../backend/app.js';
import { config } from '../backend/config.js';
import { productionIssues } from '../backend/productionCheck.js';
import { restoreVercelApiPath } from '../backend/vercelPath.js';

let connectionPromise;

function unavailable(response, error) {
  response.statusCode = 503;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify({ error }));
}

async function connect() {
  if (mongoose.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 5,
      autoIndex: false,
    }).catch(error => { connectionPromise = null; throw error; });
  }
  await connectionPromise;
}

export default async function handler(request, response) {
  request.url = restoreVercelApiPath(request.url);
  const issues = productionIssues(config);
  if (issues.length) {
    console.error('[api] Production configuration incomplete:', issues.join('; '));
    return unavailable(response, 'PixelVerse is not configured for this deployment');
  }
  try {
    await connect();
  } catch (error) {
    console.error('[api] MongoDB connection failed:', error.message);
    return unavailable(response, 'PixelVerse database is unavailable. Try again shortly.');
  }
  return app(request, response);
}
