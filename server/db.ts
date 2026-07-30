import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, IMAGES_DIR, DB_PATH, SEED_DIR } from './paths';

export type DB = Database.Database;

let db: DB | null = null;

/** The single live connection. Routes must call getDb() (never capture at import). */
export function getDb(): DB {
  if (!db) throw new Error('DB not initialized — call initDb() first');
  return db;
}

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function openConnection(): DB {
  ensureDirs();
  const conn = new Database(DB_PATH);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  conn.pragma('busy_timeout = 5000');
  return conn;
}

// ---- schema migrations (run once each, tracked by PRAGMA user_version) -------

const migrations: Array<(db: DB) => void> = [
  (d) => {
    d.exec(`
      CREATE TABLE categories (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        emoji      TEXT,
        sort       INTEGER,
        is_default INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        a3          TEXT NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        title       TEXT NOT NULL DEFAULT '',
        body_md     TEXT NOT NULL DEFAULT '',
        scope       TEXT NOT NULL DEFAULT 'country',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX idx_entries_a3 ON entries(a3);
      CREATE INDEX idx_entries_category ON entries(category_id);

      CREATE TABLE entry_regions (
        entry_id  INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        region_id TEXT NOT NULL,
        PRIMARY KEY (entry_id, region_id)
      );

      CREATE TABLE images (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        file     TEXT NOT NULL,
        caption  TEXT NOT NULL DEFAULT '',
        sort     INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_images_entry ON images(entry_id);

      CREATE TABLE coverage_overrides (
        a3      TEXT PRIMARY KEY,
        covered INTEGER NOT NULL
      );

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  },

  // M6: coverage becomes a tier (full | limited | none) instead of a boolean.
  (d) => {
    d.exec(`
      CREATE TABLE coverage_overrides_new (
        a3   TEXT PRIMARY KEY,
        tier TEXT NOT NULL
      );
      INSERT INTO coverage_overrides_new (a3, tier)
        SELECT a3, CASE WHEN covered = 1 THEN 'full' ELSE 'none' END FROM coverage_overrides;
      DROP TABLE coverage_overrides;
      ALTER TABLE coverage_overrides_new RENAME TO coverage_overrides;
    `);
  },

  // M9: colored tags.
  (d) => {
    d.exec(`
      CREATE TABLE tags (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        name  TEXT NOT NULL,
        color TEXT NOT NULL,
        sort  INTEGER
      );
      CREATE TABLE entry_tags (
        entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        tag_id   INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (entry_id, tag_id)
      );
      CREATE INDEX idx_entry_tags_tag ON entry_tags(tag_id);
    `);
  },

  // M13: per-country media slots (currently just the alphabet chart). Keyed by
  // (a3, kind) so more identity media can be added later without a migration.
  (d) => {
    d.exec(`
      CREATE TABLE country_media (
        a3         TEXT NOT NULL,
        kind       TEXT NOT NULL,
        file       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (a3, kind)
      );
    `);
  },
];

function runMigrations(d: DB) {
  const current = d.pragma('user_version', { simple: true }) as number;
  for (let i = current; i < migrations.length; i++) {
    const tx = d.transaction(() => {
      migrations[i](d);
      d.pragma(`user_version = ${i + 1}`);
    });
    tx();
  }
}

// ---- seeding (idempotent) ----------------------------------------------------

interface SeedCategory {
  name: string;
  emoji?: string;
  sort?: number;
}

function seed(d: DB) {
  // Default categories — only if none exist yet (idempotent across restarts).
  const defaults = d
    .prepare('SELECT COUNT(*) AS n FROM categories WHERE is_default = 1')
    .get() as { n: number };
  if (defaults.n === 0) {
    const seedPath = path.join(SEED_DIR, 'categories.seed.json');
    const cats = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as SeedCategory[];
    const insert = d.prepare(
      'INSERT INTO categories (name, emoji, sort, is_default) VALUES (?, ?, ?, 1)'
    );
    const tx = d.transaction((rows: SeedCategory[]) => {
      rows.forEach((c, i) => insert.run(c.name, c.emoji ?? '', c.sort ?? (i + 1) * 10));
    });
    tx(cats);
  }

  // Default settings — insert-or-ignore keeps this idempotent.
  const setDefault = d.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  setDefault.run('uncoveredMode', 'dim');
}

// ---- lifecycle ---------------------------------------------------------------

/** Open + migrate + seed. Safe to call again after closeDb() (used by import). */
export function initDb(): DB {
  db = openConnection();
  runMigrations(db);
  seed(db);
  return db;
}

export function closeDb() {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      /* ignore */
    }
    db.close();
    db = null;
  }
}

/** Flush the WAL into the main db file so a file-level copy is complete. */
export function checkpoint() {
  if (db) db.pragma('wal_checkpoint(TRUNCATE)');
}

// ---- shared coverage seed loader --------------------------------------------

export type Tier = 'full' | 'limited' | 'none';

export interface CoverageEntry {
  tier: Tier;
}

let coverageSeedCache: Record<string, CoverageEntry> | null = null;

export function loadCoverageSeed(): Record<string, CoverageEntry> {
  if (!coverageSeedCache) {
    const seedPath = path.join(SEED_DIR, 'coverage.seed.json');
    coverageSeedCache = JSON.parse(fs.readFileSync(seedPath, 'utf8')) as Record<
      string,
      CoverageEntry
    >;
  }
  return coverageSeedCache;
}

/**
 * Effective coverage = seed tiers overlaid with user overrides. Only full/limited
 * are returned; a 'none' override removes the country (absent ⇒ uncovered client-side).
 */
export function effectiveCoverage(): Record<string, CoverageEntry> {
  const seed = loadCoverageSeed();
  const out: Record<string, CoverageEntry> = {};
  for (const [a3, v] of Object.entries(seed)) {
    if (v.tier && v.tier !== 'none') out[a3] = { tier: v.tier };
  }

  const overrides = getDb()
    .prepare('SELECT a3, tier FROM coverage_overrides')
    .all() as Array<{ a3: string; tier: Tier }>;
  for (const row of overrides) {
    if (row.tier === 'none') delete out[row.a3];
    else out[row.a3] = { tier: row.tier };
  }
  return out;
}
