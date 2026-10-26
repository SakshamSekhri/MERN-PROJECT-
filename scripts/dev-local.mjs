import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { portOpen, websiteHealthy } from './local-dev-ports.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
dotenv.config();

const lan = process.argv.includes('--lan');
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of [...children].reverse()) child.kill();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

function start(label, command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(`[dev] ${label} could not start: ${error.message}`); stop(1); });
  child.on('exit', code => {
    if (!stopping) { console.error(`[dev] ${label} stopped (${code ?? 'signal'}).`); stop(1); }
  });
  return child;
}

async function waitFor(check, label, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (!stopping && Date.now() < deadline) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`${label} did not become ready. Check the messages above.`);
}

function mongoBinary() {
  if (process.platform !== 'win32') return 'mongod';
  const base = 'C:\\Program Files\\MongoDB\\Server';
  if (!existsSync(base)) throw new Error('MongoDB Community Server is not installed.');
  const versions = readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const version of versions) {
    const binary = path.join(base, version, 'bin', 'mongod.exe');
    if (existsSync(binary)) return binary;
  }
  throw new Error('Could not find mongod.exe in the MongoDB Server installation.');
}

async function apiHealthy() {
  try {
    const response = await fetch('http://127.0.0.1:4000/api/health', { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch { return false; }
}

try {
  if (!existsSync(path.join(root, '.env'))) throw new Error('Missing .env. Create a private file with MONGO_URI and JWT_SECRET first.');
  const mongoUri = process.env.MONGO_URI || '';
  if (mongoUri.startsWith('mongodb://')) {
    const address = new URL(mongoUri);
    if (['localhost', '127.0.0.1'].includes(address.hostname)) {
      const mongoPort = Number(address.port || 27017);
      if (!await portOpen(mongoPort)) {
        const dataDir = path.join(root, '.mongo-data');
        mkdirSync(dataDir, { recursive: true });
        console.log('[dev] Starting local MongoDB…');
        start('MongoDB', mongoBinary(), ['--dbpath', dataDir, '--bind_ip', '127.0.0.1', '--port', String(mongoPort),
          '--logpath', path.join(dataDir, 'mongod.log'), '--logappend', '--quiet']);
        await waitFor(() => portOpen(mongoPort), 'MongoDB');
      } else console.log('[dev] Using the running local MongoDB.');
    }
  }

  if (!await apiHealthy()) {
    if (await portOpen(4000)) throw new Error('Port 4000 is occupied, but the PixelVerse API is not healthy.');
    console.log('[dev] Starting PixelVerse API…');
    start('API', process.execPath, ['--watch', 'backend/index.js']);
    await waitFor(apiHealthy, 'PixelVerse API');
  } else console.log('[dev] Using the running PixelVerse API.');

  if (await portOpen(5173)) {
    if (!await websiteHealthy())
      throw new Error('Port 5173 is occupied by another app. Stop that app, then run npm run dev again. PixelVerse uses port 5173 for local Google sign-in.');
    console.log('[dev] Reusing the PixelVerse website already running on port 5173.');
  }
  else {
    console.log('[dev] Starting PixelVerse website…');
    start('Website', process.execPath, ['node_modules/vite/bin/vite.js', '--host', lan ? '0.0.0.0' : '127.0.0.1', '--strictPort']);
    await waitFor(websiteHealthy, 'PixelVerse website');
  }
  console.log('[dev] Ready: http://127.0.0.1:5173/');
} catch (error) {
  console.error(`[dev] ${error.message}`);
  stop(1);
}
