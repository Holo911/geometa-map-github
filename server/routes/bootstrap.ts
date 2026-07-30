import { Router } from 'express';
import { effectiveCoverage, getDb } from '../db';

export const bootstrapRouter = Router();

interface EntryCount {
  total: number;
  byCategory: Record<number, number>;
  tagIds: number[];
}

// GET /api/bootstrap -> everything the client needs at startup.
bootstrapRouter.get('/', (_req, res) => {
  const db = getDb();

  const categories = db
    .prepare('SELECT id, name, emoji, sort, is_default FROM categories ORDER BY sort, name')
    .all();

  const tags = db.prepare('SELECT id, name, color, sort FROM tags ORDER BY sort, name').all();

  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const settings: Record<string, string> = {};
  for (const r of settingsRows) settings[r.key] = r.value;

  // per-country: total, per-category counts, and which tags appear
  const entryCounts: Record<string, EntryCount> = {};
  const ensure = (a3: string) =>
    (entryCounts[a3] ??= { total: 0, byCategory: {}, tagIds: [] });

  const catRows = db
    .prepare('SELECT a3, category_id, COUNT(*) AS n FROM entries GROUP BY a3, category_id')
    .all() as Array<{ a3: string; category_id: number; n: number }>;
  for (const r of catRows) {
    const c = ensure(r.a3);
    c.byCategory[r.category_id] = r.n;
    c.total += r.n;
  }

  const tagRows = db
    .prepare(
      `SELECT DISTINCT e.a3 AS a3, et.tag_id AS tag_id
       FROM entry_tags et JOIN entries e ON e.id = et.entry_id`
    )
    .all() as Array<{ a3: string; tag_id: number }>;
  for (const r of tagRows) ensure(r.a3).tagIds.push(r.tag_id);

  // per-country media slots (alphabet charts). Small table, so it ships with
  // bootstrap and the panel never needs a per-country round-trip.
  const media: Record<string, Record<string, string>> = {};
  for (const m of db.prepare('SELECT a3, kind, file FROM country_media').all() as Array<{
    a3: string;
    kind: string;
    file: string;
  }>) {
    (media[m.a3] ??= {})[m.kind] = `/images/${m.file}`;
  }

  res.json({
    categories,
    tags,
    coverage: effectiveCoverage(),
    settings,
    entryCounts,
    countryMedia: media,
  });
});
