import net from 'node:net';

export function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host });
    socket.setTimeout(700);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', error => {
      socket.destroy();
      if (error.code === 'EACCES') reject(new Error(`Cannot check ${host}:${port}; local socket access is blocked.`));
      else resolve(false);
    });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

export async function websiteHealthy(port = 5173) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/blank.html`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return false;
    const html = await response.text();
    return html.includes('<title>PixelVerse — Blank Canvas</title>') && html.includes('id="view-editor"');
  } catch { return false; }
}

export async function selectWebPort(isOpen = portOpen, isPixelVerse = websiteHealthy) {
  if (!await isOpen(5173)) return 5173;
  if (!await isPixelVerse(5173))
    throw new Error('Port 5173 belongs to another app. Stop it before starting PixelVerse; Google sign-in needs PixelVerse on 5173.');
  if (await isOpen(5174))
    throw new Error('Ports 5173 and 5174 are both occupied. Use the running PixelVerse site or stop one website server before starting another.');
  return 5174;
}
