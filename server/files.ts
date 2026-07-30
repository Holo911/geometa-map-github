import fs from 'node:fs';
import path from 'node:path';
import { IMAGES_DIR } from './paths';

/** Delete an image file by its stored basename. Never throws; guards traversal. */
export function deleteImageFile(file: string) {
  if (!file) return;
  const safe = path.basename(file);
  try {
    fs.rmSync(path.join(IMAGES_DIR, safe), { force: true });
  } catch {
    /* ignore */
  }
}

export function imageUrl(file: string): string {
  return `/images/${file}`;
}
