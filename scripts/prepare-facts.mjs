// Country-facts generator for GeoMeta Map (M6).
//
//   node scripts/prepare-facts.mjs   (also runs as part of `npm run geodata`)
//
// Reads our generated public/geo/countries.geo.json for the a3 list, matches each
// to the mledoze/world-countries dataset by cca3, and writes a slim
// src/data/country-facts.json keyed by our a3:
//   { "COL": { native, langs, currency, tld, phone, side }, ... }

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const world = require('world-countries');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COUNTRIES = path.join(ROOT, 'public', 'geo', 'countries.geo.json');
const OUT = path.join(ROOT, 'src', 'data', 'country-facts.json');

// Our a3 -> world-countries cca3, where they differ.
const A3_MAP = { KOS: 'UNK' };

// world-countries 5.1.0 dropped the `car.side` field, so we carry the (stable,
// finite) set of left-hand-traffic countries/territories ourselves, keyed by our a3.
const LHT = new Set([
  // Europe
  'GBR', 'IRL', 'MLT', 'CYP', 'IMN', 'JEY', 'GGY',
  // Africa
  'ZAF', 'KEN', 'TZA', 'UGA', 'ZMB', 'ZWE', 'MWI', 'MOZ', 'NAM', 'BWA', 'LSO', 'SWZ', 'MUS', 'SYC',
  // Asia
  'JPN', 'IND', 'IDN', 'THA', 'MYS', 'SGP', 'PAK', 'BGD', 'LKA', 'NPL', 'BTN', 'BRN', 'HKG', 'MAC', 'TLS', 'MDV',
  // Oceania
  'AUS', 'NZL', 'PNG', 'FJI', 'TON', 'WSM', 'SLB', 'VUT', 'KIR', 'NRU', 'TUV', 'NIU', 'COK',
  // Americas & Caribbean
  'GUY', 'SUR', 'JAM', 'BHS', 'BRB', 'TTO', 'ATG', 'DMA', 'GRD', 'KNA', 'LCA', 'VCT',
  'BMU', 'VIR', 'CYM', 'TCA', 'FLK', 'MSR', 'AIA', 'VGB',
]);

function log(...a) {
  console.log('[facts]', ...a);
}

function hasNonAscii(s) {
  if (!s) return false;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) return true;
  return false;
}

/** Prefer a native name in a non-Latin script (doubles as the alphabet showcase). */
function pickNative(wc) {
  const nn = wc.name.native;
  if (nn) {
    const commons = Object.values(nn).map((v) => v.common).filter(Boolean);
    const nonLatin = commons.find(hasNonAscii);
    if (nonLatin) return nonLatin;
    if (commons[0]) return commons[0];
  }
  return wc.name.common;
}

function pickCurrency(wc) {
  const entries = Object.entries(wc.currencies || {});
  if (!entries.length) return null;
  const [code, info] = entries[0];
  const sym = info.symbol ? ` ${info.symbol}` : '';
  return `${info.name} (${code}${sym})`;
}

function pickPhone(wc) {
  const idd = wc.idd;
  if (!idd || !idd.root) return null;
  // Single suffix (most countries) => root+suffix, e.g. +5 + 7 = +57.
  // Many suffixes (NANP: +1 with area codes) => just the root.
  const suf = idd.suffixes && idd.suffixes.length === 1 ? idd.suffixes[0] : '';
  return idd.root + suf;
}

function main() {
  const fc = JSON.parse(fs.readFileSync(COUNTRIES, 'utf8'));
  const out = {};
  const unmatched = [];
  const noJa = [];

  for (const f of fc.features) {
    const a3 = f.properties.a3;
    const cca3 = A3_MAP[a3] || a3;
    const wc = world.find((x) => x.cca3 === cca3);
    if (!wc) {
      unmatched.push(a3);
      continue;
    }
    // Japanese country name for the ja UI (map tooltips, panel header, search,
    // cue pill, territory chips). Falls back to the English name.
    const nameJa = wc.translations?.jpn?.common || null;
    if (!nameJa) noJa.push(a3);
    out[a3] = {
      native: pickNative(wc),
      name_ja: nameJa || f.properties.name,
      langs: Object.values(wc.languages || {}),
      currency: pickCurrency(wc),
      tld: wc.tld && wc.tld[0] ? wc.tld[0] : null,
      phone: pickPhone(wc),
      side: LHT.has(a3) ? 'left' : 'right',
    };
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
  log(`wrote country-facts.json: ${Object.keys(out).length} matched of ${fc.features.length} features`);
  if (unmatched.length) {
    log(`unmatched a3s (no facts — territories/edge cases): ${unmatched.sort().join(', ')}`);
  }
  if (noJa.length) {
    log(`no Japanese name (fell back to English): ${noJa.sort().join(', ')}`);
  } else {
    log('Japanese names: all matched countries have one');
  }
}

main();
