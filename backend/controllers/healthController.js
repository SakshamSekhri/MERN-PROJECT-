import mongoose from 'mongoose';

export function healthStatus(_request, response) {
  const connected = mongoose.connection.readyState === 1;
  response.status(connected ? 200 : 503).json({
    service: 'pixelverse-api',
    database: connected ? 'connected' : 'disconnected',
  });
}
