import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '../db';
import { IMAGES_DIR } from '../paths';
import { deleteImageFile, imageUrl } from '../files';

// Per-country identity media (currently the alphabet chart). Same validation and
// limits as entry images, and files land in the same images/ dir so the existing
// export/import (which zips all of data/) round-trips them for free.

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Whitelisted slots — keeps `kind` from becoming an open write surface. */
const KINDS = new Set(['alphabet']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = MIME_EXT[file.mimetype] || path.extname(file.originalname) || '.png';
    cb(null, `${req.params.a3}-${req.params.kind}-${nanoid(10)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error(`Unsupported image type: ${file.mimetype}`));
  },
});

function validate(req: Request, res: Response, next: NextFunction) {
  const a3 = String(req.params.a3 || '').toUpperCase();
  const kind = String(req.params.kind || '');
  if (!/^[A-Z]{3}$/.test(a3)) return res.status(400).json({ error: 'invalid a3' });
  if (!KINDS.has(kind)) return res.status(400).json({ error: `unknown media kind: ${kind}` });
  req.params.a3 = a3;
  next();
}

export const countryMediaRouter = Router({ mergeParams: true });

// GET /api/countries/:a3/media/:kind
countryMediaRouter.get('/:a3/media/:kind', validate, (req, res) => {
  const row = getDb()
    .prepare('SELECT a3, kind, file FROM country_media WHERE a3 = ? AND kind = ?')
    .get(req.params.a3, req.params.kind) as { a3: string; kind: string; file: string } | undefined;
  if (!row) return res.status(404).json({ error: 'not set' });
  res.json({ ...row, url: imageUrl(row.file) });
});

// PUT /api/countries/:a3/media/:kind   (multipart, field name: "file")
countryMediaRouter.put(
  '/:a3/media/:kind',
  validate,
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'upload failed';
        return res.status(400).json({ error: message });
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: 'no file' });
    const { a3, kind } = req.params;
    const db = getDb();
    // replacing? drop the old file from disk so images/ doesn't accumulate orphans
    const prev = db
      .prepare('SELECT file FROM country_media WHERE a3 = ? AND kind = ?')
      .get(a3, kind) as { file: string } | undefined;
    db.prepare(
      `INSERT INTO country_media (a3, kind, file) VALUES (?, ?, ?)
       ON CONFLICT(a3, kind) DO UPDATE SET file = excluded.file, created_at = datetime('now')`
    ).run(a3, kind, file.filename);
    if (prev && prev.file !== file.filename) deleteImageFile(prev.file);
    res.json({ a3, kind, file: file.filename, url: imageUrl(file.filename) });
  }
);

// DELETE /api/countries/:a3/media/:kind
countryMediaRouter.delete('/:a3/media/:kind', validate, (req, res) => {
  const { a3, kind } = req.params;
  const db = getDb();
  const row = db
    .prepare('SELECT file FROM country_media WHERE a3 = ? AND kind = ?')
    .get(a3, kind) as { file: string } | undefined;
  if (!row) return res.status(404).json({ error: 'not set' });
  db.prepare('DELETE FROM country_media WHERE a3 = ? AND kind = ?').run(a3, kind);
  deleteImageFile(row.file);
  res.json({ ok: true });
});
