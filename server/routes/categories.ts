import { Router } from 'express';
import { getDb } from '../db';

export const categoriesRouter = Router();

interface CategoryRow {
  id: number;
  name: string;
  emoji: string | null;
  sort: number | null;
  is_default: number;
}

function getCategory(id: number): CategoryRow | undefined {
  return getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id) as
    | CategoryRow
    | undefined;
}

// POST /api/categories  { name, emoji?, sort? }
categoriesRouter.post('/', (req, res) => {
  const { name, emoji, sort } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const db = getDb();
  let sortVal = typeof sort === 'number' ? sort : null;
  if (sortVal === null) {
    const max = db.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM categories').get() as {
      m: number;
    };
    sortVal = max.m + 10;
  }
  const info = db
    .prepare('INSERT INTO categories (name, emoji, sort, is_default) VALUES (?, ?, ?, 0)')
    .run(name.trim(), typeof emoji === 'string' ? emoji : '', sortVal);
  res.status(201).json(getCategory(Number(info.lastInsertRowid)));
});

// PATCH /api/categories/:id  { name?, emoji?, sort? }
categoriesRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const cat = getCategory(id);
  if (!cat) return res.status(404).json({ error: 'category not found' });

  const { name, emoji, sort } = req.body ?? {};
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof name === 'string' && name.trim()) {
    sets.push('name = ?');
    vals.push(name.trim());
  }
  if (typeof emoji === 'string') {
    sets.push('emoji = ?');
    vals.push(emoji);
  }
  if (typeof sort === 'number') {
    sets.push('sort = ?');
    vals.push(sort);
  }
  if (sets.length === 0) return res.json(cat);

  vals.push(id);
  getDb()
    .prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`)
    .run(...vals);
  res.json(getCategory(id));
});

// DELETE /api/categories/:id
// Entries in the category are moved to Misc (never orphaned). Misc itself is protected.
categoriesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const cat = getCategory(id);
  if (!cat) return res.status(404).json({ error: 'category not found' });

  const db = getDb();
  const misc = db
    .prepare("SELECT * FROM categories WHERE name = 'Misc' AND is_default = 1")
    .get() as CategoryRow | undefined;

  if (misc && misc.id === id) {
    return res.status(400).json({ error: 'The Misc category cannot be deleted.' });
  }

  const cnt = db.prepare('SELECT COUNT(*) AS n FROM entries WHERE category_id = ?').get(id) as {
    n: number;
  };

  const tx = db.transaction(() => {
    let movedCount = 0;
    if (cnt.n > 0) {
      if (!misc) throw new Error('Misc category missing — cannot reassign entries');
      db.prepare('UPDATE entries SET category_id = ? WHERE category_id = ?').run(misc.id, id);
      movedCount = cnt.n;
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    return movedCount;
  });

  const movedCount = tx();
  res.json({ ok: true, deletedId: id, movedCount, movedTo: movedCount > 0 ? misc?.id : null });
});
