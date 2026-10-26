import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export default defineConfig({
  root: fileURLToPath(new URL('./frontend/', import.meta.url)),
  plugins: [{
    name: 'keep-phase1-landing-script',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'script.js', source: readFileSync(new URL('./frontend/script.js', import.meta.url)) });
    },
  }],
  server: { proxy: { '/api': { target: process.env.PIXELVERSE_API_PROXY || 'http://127.0.0.1:4000', ws: true } } },
  build: {
    outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./frontend/index.html', import.meta.url)),
        blank: fileURLToPath(new URL('./frontend/blank.html', import.meta.url)),
        image: fileURLToPath(new URL('./frontend/image.html', import.meta.url)),
        googleBridge: fileURLToPath(new URL('./frontend/google-bridge.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./frontend/gallery.html', import.meta.url)),
        contact: fileURLToPath(new URL('./frontend/contact.html', import.meta.url)),
        guides: fileURLToPath(new URL('./frontend/guides.html', import.meta.url)),
      },
    },
  },
});
