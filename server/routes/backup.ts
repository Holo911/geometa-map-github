import { Router, type Response } from 'express';
import multer from 'multer';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkpoint, closeDb, initDb } from '../db';
import { DATA_DIR, DB_PATH, IMAGES_DIR, ROOT } from '../paths';

export const backupRouter = Router();

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// GET /api/export  -> streams a zip of data/ (db checkpointed first)
backupRouter.get('/export', (_req, res) => {
  checkpoint();

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="geometa-backup-${timestamp()}.zip"`
  );

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500);
    res.end();
    console.error('export error:', err);
  });
  archive.pipe(res);

  if (fs.existsSync(DB_PATH)) archive.file(DB_PATH, { name: 'app.db' });
  if (fs.existsSync(IMAGES_DIR)) archive.directory(IMAGES_DIR, 'images');
  archive.finalize();
});

// POST /api/import  (multipart field "backup": a zip) -> backs up current data/,
// then replaces it with the zip's contents.
const uploadDir = path.join(os.tmpdir(), 'geometa-import');
fs.mkdirSync(uploadDir, { recursive: true });
const importUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
});

const zipPath = (name: string) => name.replace(/\\/g, '/');

/** Every SQLite file starts with this 16-byte magic string. */
const SQLITE_MAGIC = 'SQLite format 3\0';

/**
 * Find the folder inside the zip that holds the backup, and return its prefix.
 *
 * Our own export writes `app.db` + `images/…` at the root, but a hand-made zip
 * (someone zipping their whole `data` folder, or a zip with a wrapper
 * directory) nests everything one level down. Returns '' for a flat zip,
 * 'data/' for a wrapped one, or null when there's no app.db at all.
 */
function findBackupRoot(zip: AdmZip): string | null {
  const files = zip.getEntries().filter((e) => !e.isDirectory);
  const exact = files.find((e) => zipPath(e.entryName) === 'app.db');
  if (exact) return '';
  // shallowest `…/app.db` wins, so a stray nested copy can't hijack the root
  const nested = files
    .filter((e) => zipPath(e.entryName).endsWith('/app.db'))
    .sort((a, b) => zipPath(a.entryName).split('/').length - zipPath(b.entryName).split('/').length)[0];
  if (!nested) return null;
  const n = zipPath(nested.entryName);
  return n.slice(0, n.length - 'app.db'.length);
}

backupRouter.post('/import', importUpload.single('backup'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'no backup file (field name: backup)' });

  const tmpZip = file.path;
  const cleanup = () => {
    try {
      fs.rmSync(tmpZip, { force: true });
    } catch {
      /* ignore */
    }
  };

  // Validate the zip BEFORE touching current data — the import clears data/, so
  // anything we can reject up front is data the user doesn't have to restore
  // from the backup folder by hand.
  let zip: AdmZip;
  let root: string;
  try {
    zip = new AdmZip(tmpZip);
    const found = findBackupRoot(zip);
    if (found === null) {
      cleanup();
      return res.status(400).json({ error: 'zip does not contain app.db — not a GeoMeta backup' });
    }
    root = found;
    // A zip can contain a file *named* app.db that isn't a database. Catching
    // that here avoids wiping data/ and then failing to open the replacement.
    const dbEntry = zip.getEntry(`${root}app.db`);
    const head = dbEntry?.getData().subarray(0, SQLITE_MAGIC.length).toString('binary');
    if (head !== SQLITE_MAGIC) {
      cleanup();
      return res.status(400).json({ error: 'app.db in the zip is not a SQLite database' });
    }
  } catch (e) {
    cleanup();
    return res.status(400).json({ error: `invalid zip: ${(e as Error).message}` });
  }

  handleImport(zip, root, cleanup, res).catch((e) => {
    cleanup();
    try {
      initDb();
    } catch {
      /* ignore */
    }
    if (!res.headersSent) {
      // Tell the user where their data went — this path has already cleared data/.
      res.status(500).json({
        error: `import failed: ${(e as Error).message}`,
        backedUpTo: lastBackupDir ? path.basename(lastBackupDir) : undefined,
      });
    }
  });
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry a filesystem op a few times — Windows briefly locks files just closed. */
async function retry<T>(fn: () => T, tries = 6, ms = 150): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return fn();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await delay(ms);
    }
  }
}

function clearDirContents(dir: string) {
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

/**
 * Extract the backup's contents into data/, stripping the wrapper directory so
 * `app.db` always lands at `data/app.db`.
 *
 * We can't use `extractAllTo` for this: with a wrapped zip it would produce
 * `data/<wrapper>/app.db`, `initDb()` would find nothing at `data/app.db` and
 * silently create an empty database — while the import reported success.
 */
function extractBackup(zip: AdmZip, root: string) {
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = zipPath(entry.entryName);
    if (root && !name.startsWith(root)) continue; // junk outside the backup root (e.g. __MACOSX)
    const rel = name.slice(root.length);
    if (!rel) continue;

    // Defence in depth: never let an entry escape data/, whatever it's named.
    const dest = path.resolve(DATA_DIR, rel);
    if (dest !== DATA_DIR && !dest.startsWith(DATA_DIR + path.sep)) continue;

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, entry.getData());
  }
}

/** Where the most recent import copied the previous data (for error reporting). */
let lastBackupDir: string | null = null;

async function handleImport(zip: AdmZip, root: string, cleanup: () => void, res: Response) {
  const backupDir = path.join(ROOT, `data-backup-${timestamp()}`);
  lastBackupDir = null;

  closeDb();
  await delay(200); // let Windows release the SQLite file handles

  // Back up current data by COPY (renaming a dir that just held sqlite handles
  // throws EPERM on Windows), then clear data/ in place and extract the zip.
  if (fs.existsSync(DATA_DIR)) {
    await retry(() => fs.cpSync(DATA_DIR, backupDir, { recursive: true }));
    lastBackupDir = backupDir;
    await retry(() => clearDirContents(DATA_DIR));
  } else {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  extractBackup(zip, root);
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  cleanup();
  initDb(); // reopen on the restored data

  res.json({ ok: true, backedUpTo: path.basename(backupDir) });
}
