import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { mountApiRoutes } from './routes/index.js';

export const app = express();
app.disable('x-powered-by');
if (process.env.VERCEL) app.set('trust proxy', 1);
app.use((request, response, next) => {
  const started = performance.now();
  const requestId = randomUUID();
  response.setHeader('X-Request-Id', requestId);
  response.once('finish', () => {
    const elapsedMs = Math.round(performance.now() - started);
    if (response.statusCode >= 500 || elapsedMs >= 1000)
      console.warn('[api] request', JSON.stringify({ requestId, method: request.method,
        path: request.path, status: response.statusCode, elapsedMs }));
  });
  next();
});
app.use(cors({ origin: config.clientOrigins, credentials: true }));
app.use(express.json({ limit: process.env.VERCEL ? '4mb' : '5mb' }));

mountApiRoutes(app);

app.use('/api', (_request, response) => response.status(404).json({ error: 'Route not found' }));
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url)), { index: 'index.html' }));
}
app.use((error, _request, response, _next) => {
  if (error.code === 11000) return response.status(409).json({ error: 'Account or project already exists' });
  if (error.type === 'entity.too.large') return response.status(413).json({ error: 'Project is too large' });
  if (!error.status || error.status >= 500) console.error('[api]', response.getHeader('X-Request-Id'), error);
  response.status(error.status ?? 500).json({ error: error.status && error.status < 500 ? error.message : 'Internal server error' });
});
