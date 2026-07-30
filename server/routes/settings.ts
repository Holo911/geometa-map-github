import { Router } from 'express';
import { getDb } from '../db';

export const settingsRouter = Router();

// PUT /api/settings/:key   { value }
// Not in PLAN §5's list, but needed to persist UI preferences (e.g. uncoveredMode).
settingsRouter.put('/:key', (req, res) => {
  const key = String(req.params.key);
  const value = req.body?.value;
  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'value (string) required' });
  }
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(key, value);
  res.json({ key, value });
});
