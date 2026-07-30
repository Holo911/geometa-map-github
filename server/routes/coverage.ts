import { Router } from 'express';
import { getDb, loadCoverageSeed, type Tier } from '../db';

export const coverageRouter = Router();

const TIERS: Tier[] = ['full', 'limited', 'none'];

// PUT /api/coverage/:a3   { tier: 'full' | 'limited' | 'none' }
// Upserts a user override on top of the seed. If the requested tier matches the
// seed tier, the override row is removed instead (keeps the overrides table minimal).
coverageRouter.put('/:a3', (req, res) => {
  const a3 = String(req.params.a3 || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(a3)) return res.status(400).json({ error: 'invalid a3' });

  const tier = req.body?.tier as Tier;
  if (!TIERS.includes(tier)) return res.status(400).json({ error: 'tier must be full|limited|none' });

  const db = getDb();
  const seed = loadCoverageSeed();
  const seedTier: Tier = seed[a3]?.tier ?? 'none';

  if (tier === seedTier) {
    db.prepare('DELETE FROM coverage_overrides WHERE a3 = ?').run(a3);
  } else {
    db.prepare(
      `INSERT INTO coverage_overrides (a3, tier) VALUES (?, ?)
       ON CONFLICT(a3) DO UPDATE SET tier = excluded.tier`
    ).run(a3, tier);
  }

  res.json({ a3, tier });
});
