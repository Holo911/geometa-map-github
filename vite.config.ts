import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// DEV-ONLY visual-verification sink. The automated browser pane never composites
// frames, so native screenshots time out; instead the page reads its own WebGL
// canvas and POSTs a JPEG here, which lands in scratch/shots/ for inspection.
// Never part of the production build (Vite plugins only run the dev server).
function shotSink(): Plugin {
  return {
    name: 'geometa-shot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') || 'shot')
          .replace(/[^a-z0-9_-]/gi, '');
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c as Buffer));
        req.on('end', () => {
          const dir = path.resolve(__dirname, 'scratch', 'shots');
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${name}.jpg`), Buffer.concat(chunks));
          res.statusCode = 200;
          res.end('ok');
        });
      });
    },
  };
}

// Vite dev server (5173) proxies API + image requests to the Express server (5174).
// In production, `npm run build` emits to dist/ and Express serves it directly.
export default defineConfig({
  plugins: [react(), shotSink()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: false,
      },
      '/images': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
