import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { initDb } from './db';
import { spawn } from 'node:child_process';
import { DIST_DIR, HOST, IMAGES_DIR, IS_PACKAGED, PORT } from './paths';
import { bootstrapRouter } from './routes/bootstrap';
import { categoriesRouter } from './routes/categories';
import { entriesRouter } from './routes/entries';
import { entryImagesRouter, imagesRouter } from './routes/images';
import { coverageRouter } from './routes/coverage';
import { settingsRouter } from './routes/settings';
import { tagsRouter } from './routes/tags';
import { countryMediaRouter } from './routes/countryMedia';
import { backupRouter } from './routes/backup';

initDb();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

// Serve uploaded screenshots. immutable-ish: filenames include a nanoid.
app.use(
  '/images',
  express.static(IMAGES_DIR, {
    index: false,
    maxAge: '7d',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  })
);

// ---- API ----
app.use('/api/bootstrap', bootstrapRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/entries', entryImagesRouter); // POST /:id/images
app.use('/api/images', imagesRouter);
app.use('/api/coverage', coverageRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/countries', countryMediaRouter); // /:a3/media/:kind
app.use('/api', backupRouter); // /api/export, /api/import

app.use('/api', (_req, res) => res.status(404).json({ error: 'unknown API route' }));

// ---- production: serve the built frontend ----
// The portable build always serves it — there is no dev server there.
const isProd = process.env.NODE_ENV === 'production' || IS_PACKAGED;
if (isProd && fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
} else if (isProd) {
  app.get('*', (_req, res) =>
    res.status(503).send('Frontend not built. Run `npm run build` first.')
  );
}

// ---- error handler ----
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'internal error';
    console.error('API error:', err);
    if (!res.headersSent) res.status(500).json({ error: message });
  }
);

/**
 * Start listening. In packaged mode a busy port must not be a dead end for
 * someone who just double-clicked an icon, so we walk upward to the next free
 * one (a second copy simply opens on 5175) and then open the browser for them.
 * In dev we keep the old behaviour: fail loudly on EADDRINUSE, because a silent
 * port change there hides a stale server — which has bitten this project before.
 */
function start(port: number, attemptsLeft: number) {
  const server = app.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}`;
    if (IS_PACKAGED) {
      // shown in the console window the launcher leaves open
      console.log(`GeoMeta Map — ${url}`);
      console.log('Close this window to quit.  /  この黒い画面を閉じると終了します。');
      openBrowser(url);
    } else {
      console.log(`GeoMeta API listening on ${url} (prod=${isProd})`);
    }
  });
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && IS_PACKAGED && attemptsLeft > 0) {
      console.log(`Port ${port} is busy, trying ${port + 1}…`);
      start(port + 1, attemptsLeft - 1);
      return;
    }
    throw err;
  });
}

function openBrowser(url: string) {
  // `start` is a cmd builtin, so it needs a shell; the empty "" is the window
  // title argument, without which a quoted URL would be treated as the title.
  spawn('cmd', ['/c', 'start', '""', url], { detached: true, stdio: 'ignore' }).unref();
}

start(PORT, IS_PACKAGED ? 20 : 0);
