import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Packaged (portable) mode: the launcher sets GEOMETA_PACKAGED=1 and everything
 * lives next to the bundled node.exe, so the folder can be unzipped anywhere.
 * In dev, paths are resolved relative to this file as before.
 */
export const IS_PACKAGED = process.env.GEOMETA_PACKAGED === '1';

export const ROOT = IS_PACKAGED
  ? path.dirname(process.execPath) // …/GeoMetaMap/node.exe -> …/GeoMetaMap
  : path.resolve(here, '..');

export const DATA_DIR = path.join(ROOT, 'data');
export const IMAGES_DIR = path.join(DATA_DIR, 'images');
export const DB_PATH = path.join(DATA_DIR, 'app.db');
/** category + coverage seed JSON; shipped as `seed/` in the portable build */
export const SEED_DIR = IS_PACKAGED ? path.join(ROOT, 'seed') : path.join(ROOT, 'src', 'data');
export const DIST_DIR = path.join(ROOT, 'dist');
export const GEO_DIR = path.join(ROOT, 'public', 'geo');

/** Preferred port; packaged mode walks upward from here if it's taken. */
export const PORT = 5174;
export const HOST = '127.0.0.1';
