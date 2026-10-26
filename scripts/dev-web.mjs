import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectWebPort } from './local-dev-ports.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

try {
  const port = await selectWebPort();

  console.log(`[dev:web] Starting PixelVerse at http://127.0.0.1:${port}/`);
  const child = spawn(process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: root, stdio: 'inherit', windowsHide: true });
  process.on('SIGINT', () => child.kill());
  process.on('SIGTERM', () => child.kill());
  child.on('error', error => { console.error(`[dev:web] ${error.message}`); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error(`[dev:web] ${error.message}`);
  process.exitCode = 1;
}
