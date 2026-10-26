import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { restoreVercelApiPath } from '../backend/vercelPath.js';

test('Vercel maps every API path to the existing Express function', () => {
  const deployment = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(deployment.functions), ['api/index.js']);
  assert.deepEqual(deployment.rewrites, [
    { source: '/api/:path*', destination: '/api/index?pv_route=:path*' },
  ]);
  for (const route of ['health', 'auth/login', 'projects', 'gallery', 'contact']) {
    assert.equal(restoreVercelApiPath(`/api/index?pv_route=${encodeURIComponent(route)}`), `/api/${route}`);
  }
});

test('Postman collection targets a configurable new deployment and covers health, auth and project CRUD', () => {
  const collection = JSON.parse(readFileSync(new URL('../postman/PixelVerse-Evaluation-2.postman_collection.json', import.meta.url), 'utf8'));
  const variables = Object.fromEntries(collection.variable.map(({ key, value }) => [key, value]));
  assert.equal(variables.baseUrl, 'https://pixelverse-evaluation-2.vercel.app');
  assert.ok(collection.item.every(({ request }) => request.url.startsWith('{{baseUrl}}/api/')));
  const routes = collection.item.map(({ request }) => `${request.method} ${request.url.replace('{{baseUrl}}', '')}`);
  for (const expected of ['GET /api/health', 'POST /api/auth/login', 'POST /api/projects',
    'GET /api/projects', 'GET /api/projects/{{projectId}}', 'PUT /api/projects/{{projectId}}',
    'DELETE /api/projects/{{projectId}}']) assert.ok(routes.includes(expected), expected);
});

test('Vercel rewrite preserves nested API paths and query parameters', () => {
  assert.equal(restoreVercelApiPath('/api/index?pv_route=projects%2Fabc&view=full'),
    '/api/projects/abc?view=full');
  assert.equal(restoreVercelApiPath('/api/index?pv_route=auth%2Frefresh'), '/api/auth/refresh');
  assert.equal(restoreVercelApiPath('/api/gallery?page=2'), '/api/gallery?page=2');
  assert.equal(restoreVercelApiPath('/api/index?pv_route=..%2Fprivate'), '/api/invalid-route');
});

test('the Vercel API entry connects to MongoDB and serves the existing Express routes',
  { skip: !process.env.MONGO_TEST_URI }, async () => {
    const uri = process.env.MONGO_TEST_URI.replace('/pixelverse_m2_integration_test',
      '/pixelverse_vercel_integration_test');
    process.env.VERCEL = '1';
    process.env.NODE_ENV = 'production';
    process.env.MONGO_URI = uri;
    process.env.JWT_SECRET = 'vercel-test-secret-with-at-least-thirty-two-characters';
    process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_USER = 'sender@example.test';
    process.env.SMTP_PASS = 'test-only';
    process.env.MAIL_FROM = 'sender@example.test';
    process.env.APP_ORIGIN = 'https://pixelverse-test.vercel.app/blank.html';
    process.env.CLIENT_ORIGINS = 'https://pixelverse-test.vercel.app';
    const mongoose = (await import('mongoose')).default;
    const { default: handler } = await import('../api/index.js');
    const server = await new Promise(resolve => {
      const instance = createServer((request, response) => void handler(request, response));
      instance.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const origin = `http://127.0.0.1:${server.address().port}`;
      const health = await fetch(`${origin}/api/index?pv_route=health`);
      assert.equal(health.status, 200);
      assert.equal((await health.json()).database, 'connected');
      const gallery = await fetch(`${origin}/api/index?pv_route=gallery&page=1`);
      assert.equal(gallery.status, 200);
      assert.ok(Array.isArray((await gallery.json()).artworks));
      const projects = await fetch(`${origin}/api/index?pv_route=projects`);
      assert.equal(projects.status, 401);
      assert.equal((await projects.json()).error, 'Sign in required');
      const login = await fetch(`${origin}/api/index?pv_route=auth%2Flogin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid', password: 'invalid' }),
      });
      assert.equal(login.status, 400);
      assert.equal((await login.json()).error, 'Invalid email or password');
    } finally {
      await new Promise(resolve => server.close(resolve));
      await mongoose.disconnect();
    }
  });
