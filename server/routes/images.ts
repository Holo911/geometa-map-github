import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { getDb } from '../db';
import { IMAGES_DIR } from '../paths';
import { deleteImageFile, imageUrl } from '../files';
import { hydrateOne } from './entries';

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = MIME_EXT[file.mimetype] || path.extname(file.originalname) || '.png';
    cb(null, `${req.params.id}-${nanoid(10)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (MIME_EXT[file.mimetype]) cb(null, true);
    else cb(new Error(`Unsupported image type: ${file.mimetype}`));
  },
});

function ensureEntryExists(req: Request, res: Response, next: NextFunction) {
  const id = Number(req.params.id);
  if (!getDb().prepare('SELECT id FROM entries WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'entry not found' });
  }
  next();
}

// ---- POST /api/entries/:id/images  (multipart field name: "images") ----------
// Mounted under /api/entries. Used by the file picker, drag-drop, and clipboard paste.
export const entryImagesRouter = Router();

entryImagesRouter.post(
  '/:id/images',
  ensureEntryExists,
  (req: Request, res: Response, next: NextFunction) => {
    upload.array('images', 20)(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'upload failed';
        return res.status(400).json({ error: message });
      }
      next();
    });
  },
  (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const db = getDb();
    const startSort = (
      db.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM images WHERE entry_id = ?').get(id) as {
        m: number;
      }
    ).m;

    const ins = db.prepare(
      'INSERT INTO images (entry_id, file, caption, sort) VALUES (?, ?, ?, ?)'
    );
    const created: number[] = [];
    const tx = db.transaction(() => {
      files.forEach((f, i) => {
        const info = ins.run(id, f.filename, '', startSort + 1 + i);
        created.push(Number(info.lastInsertRowid));
      });
      // touch the parent entry
      db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        id
      );
    });
    tx();

    res.status(201).json(hydrateOne(id));
  }
);

// ---- /api/images/:id  (PATCH caption/sort, DELETE) ---------------------------
export const imagesRouter = Router();

interface ImageRow {
  id: number;
  entry_id: number;
  file: string;
  caption: string;
  sort: number;
}

imagesRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const img = db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRow | undefined;
  if (!img) return res.status(404).json({ error: 'image not found' });

  const { caption, sort } = req.body ?? {};
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof caption === 'string') {
    sets.push('caption = ?');
    vals.push(caption);
  }
  if (typeof sort === 'number') {
    sets.push('sort = ?');
    vals.push(sort);
  }
  if (sets.length) {
    vals.push(id);
    db.prepare(`UPDATE images SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  const updated = db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRow;
  res.json({ ...updated, url: imageUrl(updated.file) });
});

imagesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const img = db.prepare('SELECT * FROM images WHERE id = ?').get(id) as ImageRow | undefined;
  if (!img) return res.status(404).json({ error: 'image not found' });

  db.prepare('DELETE FROM images WHERE id = ?').run(id);
  deleteImageFile(img.file);
  res.json({ ok: true, deletedId: id });
});
