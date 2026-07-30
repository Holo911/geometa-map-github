import type { CountryPart } from './types';

export type BBox = [number, number, number, number]; // [w, s, e, n]

const MAX_FIT_DEG = 60; // union fit allowed if its larger dimension ≤ this
const NEAR_DEG = 22.5; // ~2500 km fallback radius around the mainland

export function unionBbox(boxes: BBox[]): BBox | null {
  if (!boxes.length) return null;
  let [w, s, e, n] = boxes[0];
  for (const b of boxes) {
    w = Math.min(w, b[0]);
    s = Math.min(s, b[1]);
    e = Math.max(e, b[2]);
    n = Math.max(n, b[3]);
  }
  return [w, s, e, n];
}

const maxDim = (b: BBox) => Math.max(b[2] - b[0], b[3] - b[1]);
const distDeg = (a: [number, number], b: [number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Point (centroid) inside a bbox, with a small tolerance. */
export function bboxContains(b: BBox, [x, y]: [number, number], pad = 0): boolean {
  return x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad;
}

/**
 * Smart default fit. If a manual override exists, use it. Otherwise union all
 * covered parts when that stays reasonably tight (Spain incl. Canaries, Portugal
 * incl. Azores); if it would show half the world (France w/ Guyane+Réunion, USA
 * w/ Alaska+Hawaii), fall back to the mainland + parts within ~2500 km.
 */
export function computeDefaultFit(parts: CountryPart[], override?: BBox): BBox | null {
  if (override) return override;
  if (!parts.length) return null;
  const all = unionBbox(parts.map((p) => p.bbox as BBox));
  if (all && maxDim(all) <= MAX_FIT_DEG) return all;
  const main = parts[0];
  const near = parts.filter((p) => distDeg(p.centroid, main.centroid) <= NEAR_DEG);
  return unionBbox(near.map((p) => p.bbox as BBox));
}
