import { useMemo, useSyncExternalStore } from 'react';
import { en } from './en';
import { ja } from './ja';

// Deliberately no i18n library. The app has one flat dictionary per language and
// a `t()` helper backed by a module-level store, so any component can call
// useT() without provider plumbing — including App, which would otherwise have
// to provide and consume the same context.

export type Lang = 'en' | 'ja';
export type DictKey = keyof typeof en;

const DICTS: Record<Lang, Record<string, string>> = { en, ja };

/** Friends with a Japanese browser get Japanese on first run, zero configuration. */
function detect(): Lang {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ja')) {
    return 'ja';
  }
  return 'en';
}

/** Resolve the effective language from the (possibly unset) `lang` setting. */
export function resolveLang(stored?: string | null): Lang {
  return stored === 'en' || stored === 'ja' ? stored : detect();
}

let current: Lang = detect();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const snapshot = () => current;

export function getLang(): Lang {
  return current;
}

export function setLang(next: Lang) {
  if (next === current) return;
  current = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const fn of listeners) fn();
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTS[lang] ?? DICTS.en;
  // fall back to English, then to the key itself, so a missing translation
  // degrades to something readable instead of blank UI
  const s = dict[key] ?? DICTS.en[key] ?? key;
  return interpolate(s, vars);
}

export interface TFn {
  (key: DictKey, vars?: Record<string, string | number>): string;
  /** count-aware lookup: uses `${key}_one` / `${key}_other`, and supplies {n} */
  n(key: string, count: number, vars?: Record<string, string | number>): string;
  lang: Lang;
}

export function useT(): TFn {
  const lang = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => {
    const fn = ((key: DictKey, vars?: Record<string, string | number>) =>
      translate(lang, key, vars)) as TFn;
    fn.n = (key, count, vars) =>
      translate(lang, `${key}_${count === 1 ? 'one' : 'other'}`, { ...vars, n: count });
    fn.lang = lang;
    return fn;
  }, [lang]);
}

/**
 * Default categories are DB rows, not chrome — but a fresh install's seeded
 * names are ours, so translate them for display. A category the user renamed
 * (or created) is their text and shows verbatim.
 */
const DEFAULT_CATEGORY_KEYS: Record<string, string> = {
  'License plates': 'cat.licensePlates',
  Bollards: 'cat.bollards',
  'Road lines & markings': 'cat.roadLines',
  Signs: 'cat.signs',
  'Utility poles': 'cat.utilityPoles',
  'Language & script': 'cat.language',
  Architecture: 'cat.architecture',
  'Landscape & vegetation': 'cat.landscape',
  'Roads & shoulders': 'cat.roads',
  'Google car & camera generation': 'cat.googleCar',
  'Phone codes & domains': 'cat.phoneDomains',
  Misc: 'cat.misc',
};

export function categoryLabel(
  lang: Lang,
  cat: { name: string; is_default?: number | boolean }
): string {
  if (!cat.is_default) return cat.name;
  const key = DEFAULT_CATEGORY_KEYS[cat.name];
  return key ? translate(lang, key) : cat.name;
}
