const loopback = ['localhost', '127.0.0.1'].includes(location.hostname);
const liveServer = loopback && ['5500', '5501'].includes(location.port);
const deployedApi = `${location.origin}/api`;

export const apiBase = window.PIXELVERSE_API_BASE ||
  (liveServer ? `${location.protocol}//${location.hostname}:4000/api` : deployedApi);
