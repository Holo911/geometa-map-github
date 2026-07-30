// Geodata pipeline for GeoMeta Map.
//
//   npm run geodata
//
// Downloads Natural Earth admin-0 (1:50m), admin-1 (1:10m) and roads (1:10m)
// shapefiles, simplifies + normalizes them with mapshaper, computes a sensible
// "view" bbox per country (largest polygon, with manual overrides), and writes:
//   public/geo/countries.geo.json          (committed)
//   public/geo/admin1/{ADM0_A3}.geo.json   (committed, one per country)
//   public/geo/parts.json                  (committed)
//   public/geo/roads.geo.json              (committed)
//
//   npm run geodata            — rebuild everything
//   node scripts/prepare-geodata.mjs --only=roads   — just the roads layer
//
// Everything under scratch/ is cache and can be deleted freely.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const mapshaper = require('mapshaper');
const AdmZip = require('adm-zip');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCRATCH = path.join(ROOT, 'scratch');
const GEO_OUT = path.join(ROOT, 'public', 'geo');
const ADMIN1_OUT = path.join(GEO_OUT, 'admin1');

const SOURCES = {
  countries: {
    url: 'https://naciscdn.org/naturalearth/50m/cultural/ne_50m_admin_0_countries.zip',
    zip: 'ne_50m_admin_0_countries.zip',
    dir: 'ne_50m_admin_0_countries',
  },
  admin1: {
    url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_1_states_provinces.zip',
    zip: 'ne_10m_admin_1_states_provinces.zip',
    dir: 'ne_10m_admin_1_states_provinces',
  },
  roads: {
    url: 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_roads.zip',
    zip: 'ne_10m_roads.zip',
    dir: 'ne_10m_roads',
  },
};

function log(...args) {
  console.log('[geodata]', ...args);
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

fs.mkdirSync(SCRATCH, { recursive: true });
fs.mkdirSync(ADMIN1_OUT, { recursive: true });

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
    log('cached:', path.basename(dest), `(${mb(fs.statSync(dest).size)})`);
    return;
  }
  log('downloading:', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  log('saved:', path.basename(dest), `(${mb(buf.length)})`);
}

function extract(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(outDir, true);
}

function findShp(dir) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const name of fs.readdirSync(cur)) {
      const full = path.join(cur, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (name.toLowerCase().endsWith('.shp')) return full;
    }
  }
  throw new Error(`No .shp found in ${dir}`);
}

// ---- bbox helpers (for country "view") --------------------------------------

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a) / 2;
}

function ringBBox(ring) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}

function largestPolygonArea(geometry) {
  if (!geometry) return 0;
  let polys;
  if (geometry.type === 'Polygon') polys = [geometry.coordinates];
  else if (geometry.type === 'MultiPolygon') polys = geometry.coordinates;
  else return 0;
  let best = 0;
  for (const poly of polys) {
    const ext = poly[0];
    if (ext && ext.length >= 3) best = Math.max(best, ringArea(ext));
  }
  return best;
}

function ringCentroid(ring) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-12) {
    // degenerate — average the vertices
    let sx = 0, sy = 0;
    for (const p of ring) { sx += p[0]; sy += p[1]; }
    return [sx / ring.length, sy / ring.length];
  }
  a *= 0.5;
  return [cx / (6 * a), cy / (6 * a)];
}

// ring area (deg^2) -> approximate km^2 at the given latitude
function deg2ToKm2(areaDeg2, lat) {
  const kmPerDeg = 111.32;
  return areaDeg2 * kmPerDeg * kmPerDeg * Math.cos((lat * Math.PI) / 180);
}

function pointInRing(pt, ring) {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// polygon = [exterior, ...holes]
function pointInPolygon(pt, polygon) {
  if (!pointInRing(pt, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) if (pointInRing(pt, polygon[h])) return false;
  return true;
}

function unionBBox(a, b) {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

// smallest gap (deg) between two bboxes; 0 if they overlap/touch
function bboxGap(a, b) {
  const dx = Math.max(0, a[0] - b[2], b[0] - a[2]);
  const dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
  return Math.sqrt(dx * dx + dy * dy);
}

// bbox of the LARGEST polygon (by exterior-ring area) — avoids overseas
// territories / antimeridian blowups that whole-geometry bounds would cause.
function largestPolygonBBox(geometry) {
  if (!geometry) return null;
  let polys;
  if (geometry.type === 'Polygon') polys = [geometry.coordinates];
  else if (geometry.type === 'MultiPolygon') polys = geometry.coordinates;
  else return null;

  let best = null;
  let bestArea = -1;
  for (const poly of polys) {
    const ext = poly[0];
    if (!ext || ext.length < 3) continue;
    const area = ringArea(ext);
    if (area > bestArea) {
      bestArea = area;
      best = ext;
    }
  }
  if (!best) return null;
  return ringBBox(best).map(round);
}

// ---- country pipeline -------------------------------------------------------

async function buildCountries(shp) {
  const rawOut = path.join(SCRATCH, 'countries_raw.geo.json');
  const cmd = [
    JSON.stringify(shp),
    '-filter', '"ADM0_A3 != \'ATA\'"',
    '-each', JSON.stringify(
      "a3 = (ISO_A3_EH && ISO_A3_EH != -99) ? ISO_A3_EH : ADM0_A3, " +
      "a2 = (ISO_A2_EH && ISO_A2_EH != -99 && ISO_A2_EH != '') ? ISO_A2_EH : '', " +
      "name = NAME, continent = CONTINENT, adm0 = ADM0_A3"
    ),
    '-filter-fields', 'a3,a2,name,continent,adm0',
    '-simplify', '20%', 'keep-shapes',
    '-o', JSON.stringify(rawOut), 'format=geojson', 'precision=0.001',
  ].join(' ');

  log('mapshaper: countries ...');
  await mapshaper.runCommands(cmd);

  const fc = JSON.parse(fs.readFileSync(rawOut, 'utf8'));
  const overrides = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src', 'data', 'view-overrides.json'), 'utf8')
  );

  // Deduplicate a3: NE gives some Australian territories ISO_A3_EH='AUS'. Keep the
  // largest feature on the shared code and reassign smaller ones to their (unique)
  // ADM0_A3, so feature ids stay 1:1 (required for feature-state + React keys).
  const byA3 = new Map();
  for (const f of fc.features) {
    const k = f.properties.a3;
    if (!byA3.has(k)) byA3.set(k, []);
    byA3.get(k).push(f);
  }
  let reassigned = 0;
  for (const [, group] of byA3) {
    if (group.length < 2) continue;
    group.sort((a, b) => largestPolygonArea(b.geometry) - largestPolygonArea(a.geometry));
    for (let i = 1; i < group.length; i++) {
      const adm0 = group[i].properties.adm0;
      if (adm0 && adm0 !== group[i].properties.a3) {
        group[i].properties.a3 = adm0;
        reassigned++;
      }
    }
  }
  if (reassigned) log(`de-duplicated ${reassigned} feature id(s) via ADM0_A3`);

  let missingView = 0;
  for (const f of fc.features) {
    delete f.properties.adm0;
    const a3 = f.properties.a3;
    let view = overrides[a3] && Array.isArray(overrides[a3])
      ? overrides[a3]
      : largestPolygonBBox(f.geometry);
    if (!view) {
      view = [-10, -10, 10, 10];
      missingView++;
    }
    f.properties.view = view;
  }

  const outPath = path.join(GEO_OUT, 'countries.geo.json');
  fs.writeFileSync(outPath, JSON.stringify(fc));
  const size = fs.statSync(outPath).size;
  log(`countries.geo.json: ${fc.features.length} features, ${mb(size)}` +
      (missingView ? ` (${missingView} without geometry view)` : ''));
  if (size > 2.5 * 1024 * 1024) {
    log('WARNING: countries.geo.json exceeds ~2.5 MB target — consider stronger simplification.');
  }
  return fc;
}

// ---- admin-1 pipeline -------------------------------------------------------

async function buildAdmin1(shp) {
  const allOut = path.join(SCRATCH, 'admin1_all.geo.json');
  const cmd = [
    JSON.stringify(shp),
    '-each', JSON.stringify(
      "region_id = (iso_3166_2 && iso_3166_2 != -99 && iso_3166_2 != '') ? iso_3166_2 : adm1_code, " +
      "name = (name_en && name_en != -99 && name_en != '') ? name_en : name"
    ),
    '-filter-fields', 'adm0_a3,region_id,name',
    '-simplify', '6%', 'keep-shapes',
    '-o', JSON.stringify(allOut), 'format=geojson', 'precision=0.001',
  ].join(' ');

  log('mapshaper: admin-1 (this is the slow one) ...');
  await mapshaper.runCommands(cmd);

  const fc = JSON.parse(fs.readFileSync(allOut, 'utf8'));

  // Group features by adm0_a3 and write one file per country.
  const byCountry = new Map();
  for (const f of fc.features) {
    const a3 = f.properties.adm0_a3;
    if (!a3 || a3 === '-99') continue;
    if (!byCountry.has(a3)) byCountry.set(a3, []);
    byCountry.get(a3).push(f);
  }

  // Clear any stale files first.
  for (const name of fs.readdirSync(ADMIN1_OUT)) {
    if (name.endsWith('.geo.json')) fs.unlinkSync(path.join(ADMIN1_OUT, name));
  }

  let total = 0;
  for (const [a3, features] of byCountry) {
    const out = { type: 'FeatureCollection', features };
    fs.writeFileSync(path.join(ADMIN1_OUT, `${a3}.geo.json`), JSON.stringify(out));
    total += features.length;
  }
  log(`admin1: ${byCountry.size} countries, ${total} regions total`);
  return byCountry;
}

// ---- parts pipeline (tiny-part dots + whole-country navigation) -------------

const MICRO_KM2 = 3000; // largest part below this ⇒ country is "micro" (dot at world zoom)
const MAINLAND_GAP = 0.12; // pass 1: only truly-touching atoms merge (departments share borders → gap≈0)
const PART_GAP = 1.0; // pass 2: cluster offshore atoms into archipelago parts
const MAX_PARTS = 14;

/** Connected components of atoms by bbox-gap ≤ gap. Returns aggregated clusters. */
function components(atoms, gap) {
  const parent = atoms.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      if (find(i) === find(j)) continue;
      if (bboxGap(atoms[i].bbox, atoms[j].bbox) <= gap) parent[find(i)] = find(j);
    }
  }
  const byRoot = new Map();
  for (let i = 0; i < atoms.length; i++) {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(atoms[i]);
  }
  return [...byRoot.values()].map((members) => {
    let bbox = members[0].bbox.slice(), areaKm2 = 0, cx = 0, cy = 0, w = 0, largest = members[0];
    for (const m of members) {
      bbox = unionBBox(bbox, m.bbox);
      areaKm2 += m.areaKm2;
      cx += m.centroid[0] * m.areaDeg2;
      cy += m.centroid[1] * m.areaDeg2;
      w += m.areaDeg2;
      if (m.areaDeg2 > largest.areaDeg2) largest = m;
    }
    return { members, bbox, areaKm2, centroid: [cx / w, cy / w], largest };
  });
}

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function admin1RegionAt(pt, regionFeatures) {
  if (!regionFeatures) return null;
  for (const rf of regionFeatures) {
    for (const poly of polygonsOf(rf.geometry)) {
      if (pointInPolygon(pt, poly)) return rf.properties.name;
    }
  }
  return null;
}

const MIN_ATOM_KM2 = 2; // drop islets below this before clustering (keeps it fast)
const MAX_ATOMS = 2500;

function buildParts(countriesFC, admin1ByCountry) {
  const out = {};
  for (const f of countriesFC.features) {
    const a3 = f.properties.a3;

    // Prefer 10m admin-1 geometry (has overseas regions: Azores, Ceuta/Melilla,
    // Mayotte…, and nice labels); fall back to the 50m country polygon.
    const regions = admin1ByCountry.get(a3);
    let atoms = [];
    if (regions && regions.length) {
      for (const rf of regions) {
        for (const poly of polygonsOf(rf.geometry)) {
          const ext = poly[0];
          if (!ext || ext.length < 3) continue;
          const centroid = ringCentroid(ext);
          const areaDeg2 = ringArea(ext);
          atoms.push({ bbox: ringBBox(ext), centroid, areaDeg2, areaKm2: deg2ToKm2(areaDeg2, centroid[1]), region: rf.properties.name });
        }
      }
    } else {
      for (const poly of polygonsOf(f.geometry)) {
        const ext = poly[0];
        if (!ext || ext.length < 3) continue;
        const centroid = ringCentroid(ext);
        const areaDeg2 = ringArea(ext);
        atoms.push({ bbox: ringBBox(ext), centroid, areaDeg2, areaKm2: deg2ToKm2(areaDeg2, centroid[1]), region: null });
      }
    }
    if (!atoms.length) continue;

    atoms.sort((a, b) => b.areaDeg2 - a.areaDeg2);
    const biggest = atoms[0];
    atoms = atoms.filter((at) => at.areaKm2 >= MIN_ATOM_KM2);
    if (atoms.length === 0) atoms = [biggest]; // always keep at least the biggest
    if (atoms.length > MAX_ATOMS) atoms = atoms.slice(0, MAX_ATOMS);

    // Pass 1 (tight): the largest truly-connected landmass is the mainland. The
    // Gibraltar strait (~0.13°) exceeds MAINLAND_GAP so Ceuta stays offshore, while
    // topology-shared department borders (gap≈0) keep the mainland whole.
    const pass1 = components(atoms, MAINLAND_GAP);
    pass1.sort((a, b) => b.areaKm2 - a.areaKm2);
    const mainland = pass1[0];
    const mainlandSet = new Set(mainland.members);
    const offshore = atoms.filter((at) => !mainlandSet.has(at));

    // Pass 2 (moderate): cluster offshore atoms into archipelago/territory parts.
    // Keeps connected secondary landmasses (NZ North Island) whole and archipelagos
    // (Balearics) together, while separating distinct exclaves (Ceuta vs Melilla).
    let clusters = [mainland, ...components(offshore, PART_GAP)];
    clusters.sort((a, b) => b.areaKm2 - a.areaKm2);
    if (clusters.length > MAX_PARTS) clusters = clusters.slice(0, MAX_PARTS);

    const parts = clusters.map((c, i) => ({
      bbox: c.bbox.map(round2),
      centroid: [round2(c.centroid[0]), round2(c.centroid[1])],
      area_km2: Math.round(c.areaKm2),
      label: i === 0 ? 'Mainland' : c.largest.region || 'Islands',
      main: i === 0,
    }));

    out[a3] = { micro: parts[0].area_km2 < MICRO_KM2, parts };
  }

  const outPath = path.join(GEO_OUT, 'parts.json');
  fs.writeFileSync(outPath, JSON.stringify(out));
  const totalParts = Object.values(out).reduce((n, c) => n + c.parts.length, 0);
  const micros = Object.values(out).filter((c) => c.micro).length;
  log(`parts.json: ${Object.keys(out).length} countries, ${totalParts} parts, ${micros} micro (${mb(fs.statSync(outPath).size)})`);
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

// ---- roads pipeline (offline road-network overlay) --------------------------

async function buildRoads(shp) {
  const rawOut = path.join(SCRATCH, 'roads_raw.geo.json');
  // Keep only `type` (for the ferry filter below). This is a low-detail "is
  // there road here?" texture, not a routing layer, so simplify freely.
  const cmd = [
    JSON.stringify(shp),
    '-filter-fields', 'type',
    '-simplify', '18%', 'keep-shapes',
    '-o', JSON.stringify(rawOut), 'format=geojson', 'precision=0.01',
  ].join(' ');

  log('mapshaper: roads ...');
  await mapshaper.runCommands(cmd);

  const fc = JSON.parse(fs.readFileSync(rawOut, 'utf8'));
  const before = fc.features.length;

  // NE roads are ~56k tiny separate features (avg ~3 vertices) — the GeoJSON is
  // dominated by per-feature wrapper overhead, not geometry. We don't need any
  // attributes, so drop ferry routes (they'd draw across open water) and dissolve
  // every remaining line into ONE MultiLineString feature. Same roads, a fraction
  // of the bytes.
  const lines = [];
  let dropped = 0;
  for (const f of fc.features) {
    const t = f.properties && f.properties.type;
    if (t && String(t).toLowerCase().indexOf('ferry') >= 0) { dropped++; continue; }
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'LineString') lines.push(g.coordinates);
    else if (g.type === 'MultiLineString') for (const l of g.coordinates) lines.push(l);
  }
  const merged = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } }],
  };

  const outPath = path.join(GEO_OUT, 'roads.geo.json');
  fs.writeFileSync(outPath, JSON.stringify(merged));
  const size = fs.statSync(outPath).size;
  log(`roads.geo.json: ${lines.length} lines from ${before} features (−${dropped} ferry), ${mb(size)}`);
  if (size > 4 * 1024 * 1024) {
    log('WARNING: roads.geo.json exceeds ~4 MB target — raise the simplify %.');
  }
}

// ---- run --------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';

  // Fetch only the sources this run needs.
  const keys = only ? (only === 'roads' ? ['roads'] : Object.keys(SOURCES)) : Object.keys(SOURCES);
  for (const key of keys) {
    const s = SOURCES[key];
    if (!s) throw new Error(`unknown source: ${key}`);
    await download(s.url, path.join(SCRATCH, s.zip));
    extract(path.join(SCRATCH, s.zip), path.join(SCRATCH, s.dir));
  }

  // Targeted rebuild of just the roads overlay (leaves committed country/admin1
  // data untouched).
  if (only === 'roads') {
    await buildRoads(findShp(path.join(SCRATCH, SOURCES.roads.dir)));
    log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s — roads only.`);
    return;
  }

  const countriesShp = findShp(path.join(SCRATCH, SOURCES.countries.dir));
  const admin1Shp = findShp(path.join(SCRATCH, SOURCES.admin1.dir));

  const countriesFC = await buildCountries(countriesShp);
  const admin1ByCountry = await buildAdmin1(admin1Shp);
  buildParts(countriesFC, admin1ByCountry);
  await buildRoads(findShp(path.join(SCRATCH, SOURCES.roads.dir)));

  const countryIds = countriesFC.features.map((f) => f.properties.a3);
  const withAdmin1 = countryIds.filter((a3) => admin1ByCountry.has(a3)).length;
  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ` +
      `${countryIds.length} countries, ${withAdmin1} have admin-1 files.`);
}

main().catch((err) => {
  console.error('[geodata] FAILED:', err);
  process.exit(1);
});
