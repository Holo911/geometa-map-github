import { Router } from 'express';
import { getDb } from '../db';

export const tagsRouter = Router();

interface TagRow {
  id: number;
  name: string;
  color: string;
  sort: number | null;
}

const getTag = (id: number) =>
  getDb().prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow | undefined;

// GET /api/tags
tagsRouter.get('/', (_req, res) => {
  res.json(getDb().prepare('SELECT * FROM tags ORDER BY sort, name').all());
});

// POST /api/tags { name, color, sort? }
tagsRouter.post('/', (req, res) => {
  const { name, color, sort } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name required' });
  if (typeof color !== 'string' || !color.trim()) return res.status(400).json({ error: 'color required' });
  const db = getDb();
  let sortVal = typeof sort === 'number' ? sort : null;
  if (sortVal === null) {
    sortVal = (db.prepare('SELECT COALESCE(MAX(sort),0) AS m FROM tags').get() as { m: number }).m + 10;
  }
  const info = db
    .prepare('INSERT INTO tags (name, color, sort) VALUES (?, ?, ?)')
    .run(name.trim(), color, sortVal);
  res.status(201).json(getTag(Number(info.lastInsertRowid)));
});

// PATCH /api/tags/:id { name?, color?, sort? }
tagsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getTag(id)) return res.status(404).json({ error: 'tag not found' });
  const { name, color, sort } = req.body ?? {};
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof name === 'string' && name.trim()) {
    sets.push('name = ?');
    vals.push(name.trim());
  }
  if (typeof color === 'string' && color.trim()) {
    sets.push('color = ?');
    vals.push(color);
  }
  if (typeof sort === 'number') {
    sets.push('sort = ?');
    vals.push(sort);
  }
  if (sets.length) {
    vals.push(id);
    getDb()
      .prepare(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`)
      .run(...vals);
  }
  res.json(getTag(id));
});

// DELETE /api/tags/:id  (cascades entry_tags)
tagsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!getTag(id)) return res.status(404).json({ error: 'tag not found' });
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id);
  res.json({ ok: true, deletedId: id });
});
