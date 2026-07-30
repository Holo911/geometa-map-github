import { Router } from 'express';
import { getDb } from '../db';
import { deleteImageFile, imageUrl } from '../files';

export const entriesRouter = Router();

interface EntryRow {
  id: number;
  a3: string;
  category_id: number;
  title: string;
  body_md: string;
  scope: string;
  created_at: string;
  updated_at: string;
}

interface ImageRow {
  id: number;
  entry_id: number;
  file: string;
  caption: string;
  sort: number;
}

export interface HydratedEntry extends EntryRow {
  region_ids: string[];
  tag_ids: number[];
  images: Array<{ id: number; file: string; url: string; caption: string; sort: number }>;
}

/** Attach region_ids + tag_ids + images to a set of entries in batch (avoids N+1). */
function hydrate(entries: EntryRow[]): HydratedEntry[] {
  if (entries.length === 0) return [];
  const db = getDb();
  const ids = entries.map((e) => e.id);
  const placeholders = ids.map(() => '?').join(',');

  const regionRows = db
    .prepare(`SELECT entry_id, region_id FROM entry_regions WHERE entry_id IN (${placeholders})`)
    .all(...ids) as Array<{ entry_id: number; region_id: string }>;
  const tagRows = db
    .prepare(`SELECT entry_id, tag_id FROM entry_tags WHERE entry_id IN (${placeholders})`)
    .all(...ids) as Array<{ entry_id: number; tag_id: number }>;
  const imageRows = db
    .prepare(
      `SELECT * FROM images WHERE entry_id IN (${placeholders}) ORDER BY sort, id`
    )
    .all(...ids) as ImageRow[];

  const regionsByEntry = new Map<number, string[]>();
  for (const r of regionRows) {
    if (!regionsByEntry.has(r.entry_id)) regionsByEntry.set(r.entry_id, []);
    regionsByEntry.get(r.entry_id)!.push(r.region_id);
  }
  const tagsByEntry = new Map<number, number[]>();
  for (const t of tagRows) {
    if (!tagsByEntry.has(t.entry_id)) tagsByEntry.set(t.entry_id, []);
    tagsByEntry.get(t.entry_id)!.push(t.tag_id);
  }
  const imagesByEntry = new Map<number, HydratedEntry['images']>();
  for (const im of imageRows) {
    if (!imagesByEntry.has(im.entry_id)) imagesByEntry.set(im.entry_id, []);
    imagesByEntry.get(im.entry_id)!.push({
      id: im.id,
      file: im.file,
      url: imageUrl(im.file),
      caption: im.caption,
      sort: im.sort,
    });
  }

  return entries.map((e) => ({
    ...e,
    region_ids: regionsByEntry.get(e.id) ?? [],
    tag_ids: tagsByEntry.get(e.id) ?? [],
    images: imagesByEntry.get(e.id) ?? [],
  }));
}

/** Replace an entry's tags with the given list (dedup, validate ids exist). */
function syncTags(entryId: number, tagIds: number[]) {
  const db = getDb();
  db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(entryId);
  const unique = [...new Set(tagIds.filter((t) => Number.isInteger(t)))];
  if (!unique.length) return;
  const ins = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)');
  const exists = db.prepare('SELECT 1 FROM tags WHERE id = ?');
  for (const t of unique) if (exists.get(t)) ins.run(entryId, t);
}

export function hydrateOne(id: number): HydratedEntry | undefined {
  const row = getDb().prepare('SELECT * FROM entries WHERE id = ?').get(id) as
    | EntryRow
    | undefined;
  if (!row) return undefined;
  return hydrate([row])[0];
}

// GET /api/entries?a3=XXX
entriesRouter.get('/', (req, res) => {
  const a3 = String(req.query.a3 ?? '').toUpperCase();
  if (!a3) return res.status(400).json({ error: 'a3 query param required' });
  const rows = getDb()
    .prepare('SELECT * FROM entries WHERE a3 = ? ORDER BY created_at, id')
    .all(a3) as EntryRow[];
  res.json(hydrate(rows));
});

// POST /api/entries  { a3, category_id, title?, body_md?, scope?, region_ids? }
entriesRouter.post('/', (req, res) => {
  const b = req.body ?? {};
  const a3 = typeof b.a3 === 'string' ? b.a3.toUpperCase() : '';
  const categoryId = Number(b.category_id);
  if (!a3) return res.status(400).json({ error: 'a3 required' });
  if (!categoryId) return res.status(400).json({ error: 'category_id required' });

  const db = getDb();
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId);
  if (!cat) return res.status(400).json({ error: 'category_id does not exist' });

  const scope = b.scope === 'regions' ? 'regions' : 'country';
  const regionIds: string[] =
    scope === 'regions' && Array.isArray(b.region_ids)
      ? [...new Set((b.region_ids as unknown[]).filter((r): r is string => typeof r === 'string' && !!r))]
      : [];
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO entries (a3, category_id, title, body_md, scope, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        a3,
        categoryId,
        typeof b.title === 'string' ? b.title : '',
        typeof b.body_md === 'string' ? b.body_md : '',
        scope,
        now,
        now
      );
    const entryId = Number(info.lastInsertRowid);
    if (regionIds.length) {
      const ins = db.prepare('INSERT INTO entry_regions (entry_id, region_id) VALUES (?, ?)');
      for (const r of regionIds) ins.run(entryId, r);
    }
    if (Array.isArray(b.tag_ids)) syncTags(entryId, b.tag_ids.map(Number));
    return entryId;
  });

  const entryId = tx();
  res.status(201).json(hydrateOne(entryId));
});

// PATCH /api/entries/:id  { title?, body_md?, category_id?, scope?, region_ids? }
entriesRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as
    | EntryRow
    | undefined;
  if (!existing) return res.status(404).json({ error: 'entry not found' });

  const b = req.body ?? {};
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof b.title === 'string') {
    sets.push('title = ?');
    vals.push(b.title);
  }
  if (typeof b.body_md === 'string') {
    sets.push('body_md = ?');
    vals.push(b.body_md);
  }
  if (b.category_id !== undefined) {
    const cid = Number(b.category_id);
    if (!db.prepare('SELECT id FROM categories WHERE id = ?').get(cid)) {
      return res.status(400).json({ error: 'category_id does not exist' });
    }
    sets.push('category_id = ?');
    vals.push(cid);
  }
  let scope = existing.scope;
  if (b.scope === 'country' || b.scope === 'regions') {
    scope = b.scope;
    sets.push('scope = ?');
    vals.push(scope);
  }

  const regionsProvided = Array.isArray(b.region_ids);
  const regionIds: string[] = regionsProvided
    ? [...new Set((b.region_ids as unknown[]).filter((r): r is string => typeof r === 'string' && !!r))]
    : [];

  const tx = db.transaction(() => {
    if (sets.length) {
      sets.push('updated_at = ?');
      vals.push(new Date().toISOString());
      vals.push(id);
      db.prepare(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }
    // Sync regions when the caller sent an explicit list, or when scope became 'country'.
    if (regionsProvided || scope === 'country') {
      db.prepare('DELETE FROM entry_regions WHERE entry_id = ?').run(id);
      if (scope === 'regions' && regionIds.length) {
        const ins = db.prepare(
          'INSERT INTO entry_regions (entry_id, region_id) VALUES (?, ?)'
        );
        for (const r of regionIds) ins.run(id, r);
      }
    }
    if (Array.isArray(b.tag_ids)) syncTags(id, b.tag_ids.map(Number));
  });
  tx();

  res.json(hydrateOne(id));
});

// DELETE /api/entries/:id  — removes DB rows (cascade) + image files on disk
entriesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT id FROM entries WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'entry not found' });

  const images = db.prepare('SELECT file FROM images WHERE entry_id = ?').all(id) as Array<{
    file: string;
  }>;
  db.prepare('DELETE FROM entries WHERE id = ?').run(id); // cascades entry_regions + images
  for (const im of images) deleteImageFile(im.file);

  res.json({ ok: true, deletedId: id });
});
