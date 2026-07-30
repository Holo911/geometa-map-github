import factsJson from '../data/country-facts.json';
import type { Lang } from '../i18n';

const FACTS = factsJson as Record<string, { name_ja?: string }>;

/**
 * Country name for display in the active UI language.
 * Falls back to the English name when we have no Japanese one (a handful of
 * disputed/edge territories) — see prepare-facts.mjs, which logs those.
 */
export function countryName(a3: string, english: string, lang: Lang): string {
  if (lang !== 'ja') return english;
  return FACTS[a3]?.name_ja || english;
}

/**
 * Japanese name regardless of UI language — search matches on BOTH names, so
 * "日本" and "japan" both find Japan whichever language the UI is in.
 */
export function countryNameJa(a3: string): string | null {
  return FACTS[a3]?.name_ja ?? null;
}
