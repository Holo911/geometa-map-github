import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CountryFC, PartsData, RegionFC, Side, Tier } from '../lib/types';
import { LHT, MAP, REGION, REGION_TINT, RHT, UNIFORM } from './palette';

// All map colours come from ./palette — see the rules documented there. The one
// non-colour constant that belongs with them:
// experimental Street View coverage raster (unofficial Google endpoint — may
// break at any time; failures are swallowed so the map degrades gracefully).
const SV_TILE_URL =
  'https://mts1.googleapis.com/vt?hl=en&lyrs=svv|cb_client:apiv3&style=5,8&x={x}&y={y}&z={z}';

const WORLD_CENTER: [number, number] = [12, 28];
const WORLD_ZOOM = 1.5;
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export type UncoveredMode = 'dim' | 'hide';

/**
 * What the map is currently spotlighting. Since M14 this covers two cases:
 *  - `selection`: one country is open; everything else dims so its national
 *    border is unmistakable. No fill colour — the country shows its regions.
 *  - `category`:  a category/tag is picked in the rail; matching countries are
 *    painted with `color`.
 * A selection takes precedence; dropping it restores whatever category/tag
 * spotlight was active underneath.
 */
export interface Spotlight {
  ids: Set<string>;
  color: string | null;
  kind: 'selection' | 'category';
}

interface WorldMapProps {
  countries: CountryFC;
  coverage: Map<string, Tier>; // effective tier per a3 (absent ⇒ none)
  sideOf: Map<string, Side>;
  entryCounts: Record<string, number>;
  colorBySide: boolean;
  partsData: PartsData;
  selectedA3: string | null;
  uncoveredMode: UncoveredMode;
  panelWidth: number;
  regions: RegionFC | null;
  regionsWithNotes: Set<string>;
  regionFilter: string | null;
  pickMode: boolean;
  pickSelected: Set<string>;
  coverageEditMode: boolean;
  showRoads: boolean;
  showSvCoverage: boolean;
  fitTarget: { box: [number, number, number, number]; nonce: number } | null;
  highlight: Spotlight | null;
  onSelect: (a3: string) => void;
  onRegionMapClick: (regionId: string) => void;
  onCycleCoverage: (a3: string) => void;
  /** clicking an offshore part dot of the already-selected country zooms to it */
  onZoomPart?: (box: [number, number, number, number]) => void;
  /** country name in the active UI language (tooltips) */
  nameOf?: (a3: string, fallback: string) => string;
  onViewportChange?: (bounds: [number, number, number, number]) => void;
  onMapReady?: (map: maplibregl.Map) => void;
}

const isCovered = (t: Tier | undefined) => t === 'full' || t === 'limited';

/** Padded hit radius (px) for the tiny-part dots — comfortably clickable. */
const DOT_HIT_PAD = 12;

/**
 * Dot opacity. Mirrors the visibility rules `pickDotAt` enforces in JS:
 * uncovered ⇒ hidden (visible-but-dim while editing coverage, so you can flip
 * one back on), otherwise shown for an active offshore part or a micro country.
 * In category/tag mode, matching dots stay lit and the rest dim like the mask.
 * NOTE: no zoom expression here — zoom and feature-state cannot be combined on a
 * circle layer (see DECISIONS M6); zoom scaling lives on circle-radius.
 */
function dotOpacityExpr(editMode: boolean, highlighted: boolean): maplibregl.ExpressionSpecification {
  const lit = (base: number) =>
    highlighted
      ? (['case', ['boolean', ['feature-state', 'hl'], false], 0.98, 0.18] as unknown)
      : (base as unknown);
  return [
    'case',
    ['==', ['feature-state', 'tier'], 'none'], editMode ? 0.45 : 0,
    ['boolean', ['feature-state', 'active'], false], lit(0.95),
    ['boolean', ['get', 'micro'], false], lit(0.9),
    0,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** Road opacity ramp. Roads sit above the spotlight mask (they must stay above
 *  region fills), so in category/tag mode they're damped down manually —
 *  otherwise a bright road network over dimmed land fights the spotlight. */
function roadOpacityExpr(damped: boolean, selected: boolean): maplibregl.ExpressionSpecification {
  if (damped) return 0.14 as unknown as maplibregl.ExpressionSpecification;
  if (selected) {
    // A country is open, so the spotlight mask already confines the network to
    // it — the "world is a hairball" reason for fading roads out doesn't apply.
    // Huge countries (Russia fits at ~z1.6) must still show their roads, which
    // the old ramp zeroed out below z3.
    return ['interpolate', ['linear'], ['zoom'], 1, 0.6, 3, 0.72, 5, 0.82, 8, 0.92] as unknown as maplibregl.ExpressionSpecification;
  }
  // Browsing the whole world: fade in earlier than before, but stay gentle so
  // 55k road lines don't drown the country colours.
  return ['interpolate', ['linear'], ['zoom'], 2, 0, 3, 0.4, 4.5, 0.62, 6, 0.78, 8, 0.9] as unknown as maplibregl.ExpressionSpecification;
}

/** Roads need a little more body when a big country is framed at low zoom. */
function roadWidthExpr(selected: boolean): maplibregl.ExpressionSpecification {
  if (selected) {
    return ['interpolate', ['linear'], ['zoom'], 1, 0.75, 3, 0.95, 5, 1.2, 8, 1.9] as unknown as maplibregl.ExpressionSpecification;
  }
  return ['interpolate', ['linear'], ['zoom'], 3, 0.4, 5, 0.9, 8, 1.8] as unknown as maplibregl.ExpressionSpecification;
}

/** Dot fill. A dot is a tiny country, so it reuses the polygon fill expression —
 *  except in category/tag mode, where it takes the highlight/tag colour. */
function dotColorExpr(bySide: boolean, highlightColor: string | null): maplibregl.ExpressionSpecification {
  if (!highlightColor) return fillColorExpr(bySide);
  return [
    'case',
    ['boolean', ['feature-state', 'hl'], false], highlightColor,
    MAP.uncovered,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/** `['case', isLeft, leftValue, rightValue]` — branch on the mirrored `side` state. */
const bySideExpr = (left: unknown, right: unknown) =>
  ['case', ['==', ['feature-state', 'side'], 'left'], left, right];

// Hue-family constancy is the rule: hovering never moves a country to the other
// family's hue. A left-hand-traffic country brightens within violet, a
// right-hand one within blue. (Uniform mode has one family, so one hover.)
function fillColorExpr(bySide: boolean): maplibregl.ExpressionSpecification {
  if (!bySide) {
    return [
      'case',
      ['boolean', ['feature-state', 'hover'], false], UNIFORM.hover,
      ['==', ['feature-state', 'tier'], 'full'],
      ['case', ['boolean', ['feature-state', 'hasNotes'], false], UNIFORM.notes, UNIFORM.full],
      ['==', ['feature-state', 'tier'], 'limited'], UNIFORM.limited,
      MAP.uncovered,
    ] as unknown as maplibregl.ExpressionSpecification;
  }
  return [
    'case',
    ['boolean', ['feature-state', 'hover'], false], bySideExpr(LHT.hover, RHT.hover),
    ['==', ['feature-state', 'tier'], 'full'],
    bySideExpr(
      ['case', ['boolean', ['feature-state', 'hasNotes'], false], LHT.notes, LHT.full],
      ['case', ['boolean', ['feature-state', 'hasNotes'], false], RHT.notes, RHT.full]
    ),
    ['==', ['feature-state', 'tier'], 'limited'], bySideExpr(LHT.limited, RHT.limited),
    MAP.uncovered,
  ] as unknown as maplibregl.ExpressionSpecification;
}

function borderColorExpr(bySide: boolean): maplibregl.ExpressionSpecification {
  if (!bySide) {
    return [
      'case',
      ['boolean', ['feature-state', 'hover'], false], UNIFORM.hoverBorder,
      ['any', ['==', ['feature-state', 'tier'], 'full'], ['==', ['feature-state', 'tier'], 'limited']],
      UNIFORM.border,
      MAP.uncoveredBorder,
    ] as unknown as maplibregl.ExpressionSpecification;
  }
  return [
    'case',
    ['boolean', ['feature-state', 'hover'], false], bySideExpr(LHT.hoverBorder, RHT.hoverBorder),
    ['==', ['feature-state', 'tier'], 'full'], bySideExpr(LHT.border, RHT.border),
    MAP.uncoveredBorder,
  ] as unknown as maplibregl.ExpressionSpecification;
}

export default function WorldMap({
  countries,
  coverage,
  sideOf,
  entryCounts,
  colorBySide,
  partsData,
  selectedA3,
  uncoveredMode,
  panelWidth,
  regions,
  regionsWithNotes,
  regionFilter,
  pickMode,
  pickSelected,
  coverageEditMode,
  showRoads,
  showSvCoverage,
  fitTarget,
  highlight,
  onSelect,
  onRegionMapClick,
  onCycleCoverage,
  onZoomPart,
  nameOf,
  onViewportChange,
  onMapReady,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const loadedRef = useRef(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const hoveredCountryRef = useRef<string | null>(null);
  const hoveredRegionRef = useRef<string | null>(null);
  const activePartsRef = useRef<string | null>(null);
  const regionsActiveRef = useRef(false);

  const namesRef = useRef<Map<string, string>>(new Map());
  const regionNamesRef = useRef<Map<string, string>>(new Map());
  const partIdsRef = useRef<Map<string, string[]>>(new Map());
  const partsFCRef = useRef<GeoJSON.FeatureCollection>(EMPTY_FC);

  const coverageRef = useRef(coverage);
  const countsRef = useRef(entryCounts);
  const onSelectRef = useRef(onSelect);
  const onRegionClickRef = useRef(onRegionMapClick);
  const coverageEditRef = useRef(coverageEditMode);
  const onCycleRef = useRef(onCycleCoverage);
  const selectedRef = useRef(selectedA3);
  selectedRef.current = selectedA3;
  const showRoadsRef = useRef(showRoads);
  showRoadsRef.current = showRoads;
  const showSvRef = useRef(showSvCoverage);
  showSvRef.current = showSvCoverage;
  const onZoomPartRef = useRef(onZoomPart);
  onZoomPartRef.current = onZoomPart;
  const nameOfRef = useRef(nameOf);
  nameOfRef.current = nameOf;
  const partsDataRef = useRef(partsData);
  partsDataRef.current = partsData;
  const highlightRef = useRef(highlight);
  highlightRef.current = highlight;
  /** which a3 currently carries the `sel` feature-state, so we can clear it */
  const selOutlinedRef = useRef<string | null>(null);
  const onViewportRef = useRef(onViewportChange);
  onViewportRef.current = onViewportChange;
  coverageRef.current = coverage;
  countsRef.current = entryCounts;
  onSelectRef.current = onSelect;
  onRegionClickRef.current = onRegionMapClick;
  coverageEditRef.current = coverageEditMode;
  onCycleRef.current = onCycleCoverage;

  // ---- init map once --------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    for (const f of countries.features) {
      namesRef.current.set(f.properties.a3, f.properties.name);
    }

    // Build a point source for the tiny-part dots.
    const partFeatures: GeoJSON.Feature[] = [];
    partIdsRef.current.clear();
    for (const [a3, info] of Object.entries(partsData)) {
      info.parts.forEach((p, i) => {
        const id = `${a3}#${i}`;
        if (!partIdsRef.current.has(a3)) partIdsRef.current.set(a3, []);
        partIdsRef.current.get(a3)!.push(id);
        partFeatures.push({
          type: 'Feature',
          id,
          // `pid` mirrors the feature id into a PROPERTY so the source can use
          // promoteId — see the addSource call for why that matters.
          properties: { a3, pid: id, main: p.main, micro: info.micro, label: p.label },
          geometry: { type: 'Point', coordinates: p.centroid },
        });
      });
    }
    partsFCRef.current = { type: 'FeatureCollection', features: partFeatures };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': MAP.ocean } }],
      },
      center: WORLD_CENTER,
      zoom: WORLD_ZOOM,
      minZoom: 1.2,
      maxZoom: 8,
      renderWorldCopies: true,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      preserveDrawingBuffer:
        typeof location !== 'undefined' && location.search.indexOf('headless') !== -1,
    });
    mapRef.current = map;
    map.on('error', (e) => {
      // The experimental SV coverage layer hits an unofficial Google endpoint
      // that can 4xx/timeout — ignore those so a broken overlay never spams the
      // console or looks like an app error.
      if ((e as { sourceId?: string }).sourceId === 'sv-coverage') return;
      console.error('MapLibre error:', e && (e as { error?: Error }).error);
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      map.addSource('countries', {
        type: 'geojson',
        data: countries as unknown as GeoJSON.FeatureCollection,
        promoteId: 'a3',
      });

      map.addLayer({
        id: 'countries-fill',
        type: 'fill',
        source: 'countries',
        paint: {
          'fill-color': fillColorExpr(colorBySide),
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hidden'], false], 0, 1],
        },
      });

      // solid border (hidden for limited, which uses the dashed layer)
      map.addLayer({
        id: 'countries-outline',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': borderColorExpr(colorBySide),
          // Borders carry the structure. Against the brighter V3 fills the old
          // 0.6px @ 0.6 opacity vanished and the continent read as one slab, so
          // they're stronger now — this is what separates country from country.
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.2, 0.9],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 1,
            ['boolean', ['feature-state', 'hidden'], false], 0,
            ['==', ['feature-state', 'tier'], 'limited'], 0,
            0.9,
          ],
        },
      });

      // dashed border, only for limited tier
      map.addLayer({
        id: 'countries-limited-outline',
        type: 'line',
        source: 'countries',
        paint: {
          // "limited" must read as lighter + DASHED at a glance; 1px vanished
          // against the brighter V3 fills.
          'line-dasharray': [2.4, 1.7],
          'line-width': 1.6,
          'line-color': bySideExpr(LHT.limitedLine, RHT.limitedLine) as unknown as maplibregl.ExpressionSpecification,
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false], 0,
            ['boolean', ['feature-state', 'hidden'], false], 0,
            ['==', ['feature-state', 'tier'], 'limited'], 0.9,
            0,
          ],
        },
      });

      // amber "has notes" outline, on top
      map.addLayer({
        id: 'countries-notes-outline',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': MAP.notesOutline,
          'line-width': MAP.notesOutlineWidth,
          'line-opacity': [
            'case',
            ['all', ['boolean', ['feature-state', 'hasNotes'], false], ['!', ['boolean', ['feature-state', 'hidden'], false]]],
            0.95, 0,
          ],
        },
      });

      // Region fills go in BEFORE the spotlight mask, so that when a country is
      // selected the mask dims its neighbours' land *and* their roads while the
      // selected country (mask opacity 0) shows its regions and roads at full
      // strength. Region OUTLINES go after the mask so they stay crisp.
      map.addSource('regions', { type: 'geojson', data: EMPTY_FC, promoteId: 'region_id' });
      map.addLayer({
        id: 'regions-fill',
        type: 'fill',
        source: 'regions',
        paint: {
          // base colour is re-tinted per driving side when the selection changes
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'picked'], false], REGION.picked,
            ['boolean', ['feature-state', 'hover'], false], REGION.hover,
            ['boolean', ['feature-state', 'filtered'], false], REGION.filtered,
            ['boolean', ['feature-state', 'hasNotes'], false], REGION.hasNotes,
            REGION_TINT.uniform.base,
          ],
          // stepped up from V3: with the surroundings dimmed hard, the selected
          // country has to read as genuinely lit, not merely "less washed"
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'dim'], false], 0.08,
            ['boolean', ['feature-state', 'picked'], false], 0.72,
            ['boolean', ['feature-state', 'hover'], false], 0.62,
            ['boolean', ['feature-state', 'filtered'], false], 0.66,
            ['boolean', ['feature-state', 'hasNotes'], false], 0.52,
            0.34,
          ],
        },
      });

      // "spotlight" overlays — used by BOTH category/tag mode and, since M14, a
      // plain country selection (hidden until one of those is active).
      map.addLayer({
        id: 'highlight-mask',
        type: 'fill',
        source: 'countries',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': MAP.spotlightMask,
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hl'], false], 0,
            // a hovered neighbour lifts out of the dim, so it still advertises
            // that it's clickable
            ['boolean', ['feature-state', 'hover'], false], MAP.spotlightDimHover,
            MAP.spotlightDim,
          ],
        },
      });
      map.addLayer({
        id: 'highlight-fill',
        type: 'fill',
        source: 'countries',
        layout: { visibility: 'none' },
        paint: {
          'fill-color': MAP.highlightDefault,
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hl'], false], 0.9, 0],
        },
      });

      map.addLayer({
        id: 'regions-outline',
        type: 'line',
        source: 'regions',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], REGION.lineHover, REGION_TINT.uniform.line],
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 1.1],
          'line-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.2, 0.85],
        },
      });

      // The national edge of the selected country: a dark halo under a thick
      // near-white line, so the border reads as a hard edge whether it sits
      // against dimmed neighbours or bright ocean. This is the thing that stops
      // you mousing into Poland thinking it's another German region.
      map.addLayer({
        id: 'selection-outline-halo',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': MAP.selectionOutlineHalo,
          'line-width': MAP.selectionOutlineHaloWidth,
          'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 0.85, 0],
        },
      });
      map.addLayer({
        id: 'selection-outline',
        type: 'line',
        source: 'countries',
        paint: {
          'line-color': MAP.selectionOutline,
          'line-width': MAP.selectionOutlineWidth,
          'line-opacity': ['case', ['boolean', ['feature-state', 'sel'], false], 1, 0],
        },
      });

      // experimental Street View coverage overlay (topmost; tiles fetched only
      // while visible). Errors are swallowed by the map 'error' handler above.
      map.addSource('sv-coverage', {
        type: 'raster',
        tiles: [SV_TILE_URL],
        tileSize: 256,
        maxzoom: 17,
        attribution: '',
      });
      map.addLayer({
        id: 'sv-coverage',
        type: 'raster',
        source: 'sv-coverage',
        layout: { visibility: showSvRef.current ? 'visible' : 'none' },
        paint: { 'raster-opacity': 0.8 },
      });

      loadedRef.current = true;
      applyCoverageState();
      if (showRoadsRef.current) ensureRoadsLayer(map);

      // Dots are picked FIRST, before regions and country polygons. A micro
      // country's own polygon is sub-pixel at world zoom, and the polygon under
      // the cursor usually belongs to a *neighbour* — so if dots lose the race,
      // Malta/Monaco/Andorra are simply not clickable, which was the V2 bug.
      map.on('mousemove', (e) => {
        const dot = pickDotAt(e.point);
        if (dot) {
          handleCountryHover(dot.a3, e.point.x, e.point.y);
          return;
        }
        if (regionsActiveRef.current) {
          const rf = map.queryRenderedFeatures(e.point, { layers: ['regions-fill'] });
          if (rf.length) {
            handleRegionHover(rf[0].id as string, e.point.x, e.point.y);
            return;
          }
        }
        const cf = map.queryRenderedFeatures(e.point, { layers: ['countries-fill'] });
        if (cf.length) {
          handleCountryHover(cf[0].id as string, e.point.x, e.point.y);
          return;
        }
        clearHover();
      });
      map.on('mouseout', clearHover);

      map.on('moveend', () => {
        if (!onViewportRef.current) return;
        const b = map.getBounds();
        onViewportRef.current([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      });

      map.on('click', (e) => {
        const dot = pickDotAt(e.point);

        if (coverageEditRef.current) {
          // a dot cycles its country's tier exactly like the polygon does
          if (dot) return onCycleRef.current(dot.a3);
          const cf = map.queryRenderedFeatures(e.point, { layers: ['countries-fill'] });
          if (cf.length) onCycleRef.current(cf[0].id as string);
          return;
        }

        if (dot) {
          // An offshore part of the country you're already looking at means
          // "take me there"; anything else means "select this country".
          const info = partsDataRef.current[dot.a3];
          const part = info?.parts[dot.partIndex];
          if (dot.a3 === selectedRef.current && part && !part.main && onZoomPartRef.current) {
            onZoomPartRef.current(part.bbox as [number, number, number, number]);
          } else if (isCovered(coverageRef.current.get(dot.a3))) {
            onSelectRef.current(dot.a3);
          }
          return;
        }

        if (regionsActiveRef.current) {
          const rf = map.queryRenderedFeatures(e.point, { layers: ['regions-fill'] });
          if (rf.length) {
            onRegionClickRef.current(rf[0].id as string);
            return;
          }
        }
        const cf = map.queryRenderedFeatures(e.point, { layers: ['countries-fill'] });
        const a3 = cf.length ? (cf[0].id as string) : null;
        if (a3 && isCovered(coverageRef.current.get(a3))) onSelectRef.current(a3);
      });

      if (onMapReady) onMapReady(map);
    });

    /**
     * Pick the dot nearest `point`, or null.
     *
     * Two things this must get right:
     *  1. **Hit area.** A dot's visual radius is only ~3px at world zoom, which
     *     is far too small to click. We query a padded BOX (hit radius, not
     *     visual radius) and take the nearest match.
     *  2. **Only dots that are actually visible.** queryRenderedFeatures ignores
     *     paint opacity, so invisible dots (uncovered countries, or offshore
     *     parts of a country that isn't active) would still be clickable and
     *     would hijack clicks on the ocean. We mirror the opacity expression's
     *     rules here in JS.
     */
    function pickDotAt(point: maplibregl.Point): { a3: string; partIndex: number } | null {
      const map = mapRef.current;
      if (!map || !map.getLayer('country-dots')) return null;
      const pad = DOT_HIT_PAD;
      const feats = map.queryRenderedFeatures(
        [
          [point.x - pad, point.y - pad],
          [point.x + pad, point.y + pad],
        ],
        { layers: ['country-dots'] }
      );
      let best: maplibregl.MapGeoJSONFeature | null = null;
      let bestDist = Infinity;
      for (const f of feats) {
        const a3 = f.properties!.a3 as string;
        const pid = String(f.properties!.pid ?? '');
        const covered = isCovered(coverageRef.current.get(a3));
        // In coverage-edit mode uncovered dots stay visible so you can flip them
        // back on; in normal browsing they must not advertise themselves at all.
        if (!covered && !coverageEditRef.current) continue;
        const isMain = pid.endsWith('#0');
        const activeHere = activePartsRef.current === a3 && !isMain;
        const micro = !!f.properties!.micro;
        if (!activeHere && !micro) continue;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        const p = map.project([lng, lat]);
        const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = f;
        }
      }
      if (!best) return null;
      const pid = String(best.properties!.pid ?? '');
      return { a3: best.properties!.a3 as string, partIndex: Number(pid.split('#')[1] ?? 0) };
    }

    function setPartsHover(a3: string, on: boolean) {
      const map = mapRef.current!;
      for (const id of partIdsRef.current.get(a3) ?? []) {
        map.setFeatureState({ source: 'parts', id }, { hover: on });
      }
    }

    function handleCountryHover(a3: string, x: number, y: number) {
      const map = mapRef.current!;
      clearRegionHover();
      const covered = isCovered(coverageRef.current.get(a3));
      if (!covered && !coverageEditRef.current) {
        clearCountryHover();
        map.getCanvas().style.cursor = '';
        hideTooltip();
        return;
      }
      map.getCanvas().style.cursor = 'pointer';
      if (hoveredCountryRef.current !== a3) {
        clearCountryHover();
        hoveredCountryRef.current = a3;
        map.setFeatureState({ source: 'countries', id: a3 }, { hover: true });
        setPartsHover(a3, true);
        setActivePartsFor(a3); // reveal this country's offshore dots
      }
      const n = countsRef.current[a3] || 0;
      const raw = namesRef.current.get(a3) || a3;
      scheduleTooltip(x, y, nameOfRef.current ? nameOfRef.current(a3, raw) : raw, n);
    }

    function handleRegionHover(regionId: string, x: number, y: number) {
      const map = mapRef.current!;
      clearCountryHover();
      map.getCanvas().style.cursor = 'pointer';
      if (hoveredRegionRef.current !== regionId) {
        clearRegionHover();
        hoveredRegionRef.current = regionId;
        map.setFeatureState({ source: 'regions', id: regionId }, { hover: true });
      }
      scheduleTooltip(x, y, regionNamesRef.current.get(regionId) || regionId, 0);
    }

    function clearCountryHover() {
      const map = mapRef.current;
      if (map && hoveredCountryRef.current) {
        map.setFeatureState({ source: 'countries', id: hoveredCountryRef.current }, { hover: false });
        setPartsHover(hoveredCountryRef.current, false);
      }
      hoveredCountryRef.current = null;
      setActivePartsFor(selectedRef.current); // restore dots to the selected country (or none)
    }
    function clearRegionHover() {
      const map = mapRef.current;
      if (map && hoveredRegionRef.current && map.getSource('regions')) {
        map.setFeatureState({ source: 'regions', id: hoveredRegionRef.current }, { hover: false });
      }
      hoveredRegionRef.current = null;
    }
    function clearHover() {
      clearCountryHover();
      clearRegionHover();
      const map = mapRef.current;
      if (map) map.getCanvas().style.cursor = '';
      hideTooltip();
    }

    function scheduleTooltip(x: number, y: number, label: string, count: number) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const tip = tooltipRef.current;
        if (!tip) return;
        tip.style.display = 'block';
        tip.style.left = `${x}px`;
        tip.style.top = `${y}px`;
        tip.innerHTML =
          `${escapeHtml(label)}` +
          (count > 0 ? `<span class="tt-count">${count} note${count === 1 ? '' : 's'}</span>` : '');
      });
    }
    function hideTooltip() {
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      hoveredCountryRef.current = null;
      hoveredRegionRef.current = null;
      activePartsRef.current = null;
      regionsActiveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries]);

  // Idempotently add the parts source + dots layer (kept out of the load handler
  // to avoid a StrictMode double-mount race where the last addLayer no-ops).
  function addDotsLayer(map: maplibregl.Map) {
    if (map.getLayer('country-dots')) return;
    // A fresh array per property — MapLibre compiles expression arrays in place,
    // so sharing one instance across two paint props corrupts the second.
    const hl = highlightRef.current;
    const dotOpacity = () => dotOpacityExpr(coverageEditRef.current, !!hl);
    map.addLayer({
      id: 'country-dots',
      type: 'circle',
      source: 'parts',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 1.2, 3, 4, 5, 7, 7],
        // A dot is a tiny country: reuse the polygon fill expression verbatim so
        // every state (side base, has-notes, limited, family hover) matches.
        // fillColorExpr() returns a FRESH array per call — required, MapLibre
        // compiles expression arrays in place.
        'circle-color': fillColorExpr(colorBySide),
        'circle-stroke-color': MAP.dotStroke,
        'circle-stroke-width': 1.4,
        'circle-opacity': dotOpacity(),
        'circle-stroke-opacity': dotOpacity(),
      },
    });
    applyCoverageState();
  }

  // Lazily add the offline roads overlay (source + line layer) the first time
  // it's switched on — avoids fetching the ~3.4 MB GeoJSON when it's off.
  //
  // Insertion point: directly BELOW `highlight-mask`, i.e. above the country
  // fills AND above the admin-1 region fills of a selected country. Inserting it
  // below `countries-outline` (V2) meant region fills painted over the roads, so
  // roads vanished exactly when you drilled into a country. Sitting below the
  // mask additionally means roads over dimmed neighbours dim with them (M14)
  // while roads inside the selected country stay at full strength.
  function ensureRoadsLayer(map: maplibregl.Map) {
    if (map.getLayer('roads')) return;
    if (!map.getSource('roads')) {
      map.addSource('roads', { type: 'geojson', data: '/geo/roads.geo.json' });
    }
    const beforeId = map.getLayer('highlight-mask')
      ? 'highlight-mask'
      : map.getLayer('regions-outline')
        ? 'regions-outline'
        : map.getLayer('countries-outline')
          ? 'countries-outline'
          : undefined;
    map.addLayer(
      {
        id: 'roads',
        type: 'line',
        source: 'roads',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': MAP.road,
          'line-width': roadWidthExpr(highlightRef.current?.kind === 'selection'),
          'line-opacity': roadOpacityExpr(
            highlightRef.current?.kind === 'category',
            highlightRef.current?.kind === 'selection'
          ),
        },
      },
      beforeId
    );
  }

  // Robustly install the parts source + dots layer once the style has settled.
  // (Adding a circle layer in the same tick as its point source silently no-ops,
  // and isStyleLoaded() is transiently false right after the load handler runs.)
  useEffect(() => {
    let cancelled = false;
    let tries = 0;
    const attempt = () => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      if (!loadedRef.current || !map.isStyleLoaded()) {
        if (tries++ < 200) setTimeout(attempt, 40);
        return;
      }
      const src = map.getSource('parts') as maplibregl.GeoJSONSource | undefined;
      if (!src) {
        // promoteId is REQUIRED here. Part ids are strings ("MLT#0"); without
        // promoting a property to the feature id, setFeatureState still
        // round-trips through getFeatureState (it's a plain JS map) but the
        // RENDERER never binds the state — every paint expression reading
        // ['feature-state', …] silently falls through to its default. That is
        // why V2 dots were all one flat colour and why coverage gating on dots
        // never took effect.
        map.addSource('parts', { type: 'geojson', data: partsFCRef.current, promoteId: 'pid' });
        setTimeout(attempt, 40); // add the layer in a later tick
        return;
      }
      src.setData(partsFCRef.current);
      addDotsLayer(map);
    };
    attempt();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partsData]);

  // ---- country + parts feature-state ---------------------------------------
  function applyCoverageState() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const hide = uncoveredMode === 'hide';
    for (const f of countries.features) {
      const a3 = f.properties.a3;
      const tier: Tier = coverage.get(a3) ?? 'none';
      const covered = isCovered(tier);
      const side = sideOf.get(a3) ?? 'right';
      const hasNotes = covered && (entryCounts[a3] || 0) > 0;
      map.setFeatureState({ source: 'countries', id: a3 }, { tier, side, hasNotes, hidden: !covered && hide });
    }
    // mirror onto the dot parts — but only once the parts source is installed
    // (it's added lazily a few ticks after load; without this guard the initial
    // calls flood the console with "source 'parts' does not exist").
    if (map.getSource('parts')) {
      for (const [a3, ids] of partIdsRef.current) {
        const tier: Tier = coverage.get(a3) ?? 'none';
        const side = sideOf.get(a3) ?? 'right';
        const hasNotes = isCovered(tier) && (entryCounts[a3] || 0) > 0;
        for (const id of ids) map.setFeatureState({ source: 'parts', id }, { tier, side, hasNotes });
      }
    }
  }
  useEffect(() => {
    applyCoverageState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage, sideOf, entryCounts, uncoveredMode]);

  // ---- spotlight (country selection since M14, plus category/tag mode) ------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer('highlight-mask')) return;
    // Coverage-edit is a "see everything" mode — spotlighting would fight it.
    const active = coverageEditMode ? null : highlight;

    if (active) {
      for (const f of countries.features) {
        map.setFeatureState(
          { source: 'countries', id: f.properties.a3 },
          { hl: active.ids.has(f.properties.a3) }
        );
      }
      // Only category/tag mode paints a colour over the matches; a selection
      // shows the country's own regions instead.
      if (active.kind === 'category' && active.color) {
        map.setPaintProperty('highlight-fill', 'fill-color', active.color);
      }
      map.setLayoutProperty('highlight-mask', 'visibility', 'visible');
      map.setLayoutProperty('highlight-fill', 'visibility', active.kind === 'category' ? 'visible' : 'none');
    } else {
      map.setLayoutProperty('highlight-mask', 'visibility', 'none');
      map.setLayoutProperty('highlight-fill', 'visibility', 'none');
    }
    // A dot is a tiny country, so the spotlight has to reach it too: mirror `hl`
    // onto the parts source, otherwise micro countries (Luxembourg, Malta…) stay
    // base-coloured in tag mode and the user skips right over them.
    if (map.getSource('parts')) {
      for (const [a3, ids] of partIdsRef.current) {
        const on = !!active && active.ids.has(a3);
        for (const id of ids) map.setFeatureState({ source: 'parts', id }, { hl: on });
      }
    }
    syncDotPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, coverageEditMode]);

  // ---- selected country: the hard national edge + region tint --------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const prev = selOutlinedRef.current;
    if (prev && prev !== selectedA3) {
      map.setFeatureState({ source: 'countries', id: prev }, { sel: false });
    }
    if (selectedA3) map.setFeatureState({ source: 'countries', id: selectedA3 }, { sel: true });
    selOutlinedRef.current = selectedA3;

    // Regions keep the country's driving-side hue, so drilling in never changes
    // which family a country reads as.
    if (map.getLayer('regions-fill')) {
      const side = selectedA3 ? sideOf.get(selectedA3) ?? 'right' : 'right';
      const tint = colorBySide ? REGION_TINT[side] : REGION_TINT.uniform;
      map.setPaintProperty('regions-fill', 'fill-color', [
        'case',
        ['boolean', ['feature-state', 'picked'], false], REGION.picked,
        ['boolean', ['feature-state', 'hover'], false], REGION.hover,
        ['boolean', ['feature-state', 'filtered'], false], REGION.filtered,
        ['boolean', ['feature-state', 'hasNotes'], false], REGION.hasNotes,
        tint.base,
      ] as unknown as maplibregl.ExpressionSpecification);
      map.setPaintProperty('regions-outline', 'line-color', [
        'case',
        ['boolean', ['feature-state', 'hover'], false], REGION.lineHover,
        tint.line,
      ] as unknown as maplibregl.ExpressionSpecification);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedA3, colorBySide, sideOf]);

  /** Keep the dots' colour/opacity in step with side-colouring, coverage-edit and spotlight. */
  function syncDotPaint() {
    const map = mapRef.current;
    if (!map) return;
    const hl = coverageEditMode ? null : highlightRef.current;
    if (map.getLayer('country-dots')) {
      // a selection spotlight has no colour — dots keep their family colours and
      // simply dim if they're not the selected country
      map.setPaintProperty('country-dots', 'circle-color', dotColorExpr(colorBySide, hl?.color ?? null));
      // separate calls ⇒ separate arrays (MapLibre compiles them in place)
      map.setPaintProperty('country-dots', 'circle-opacity', dotOpacityExpr(coverageEditMode, !!hl));
      map.setPaintProperty('country-dots', 'circle-stroke-opacity', dotOpacityExpr(coverageEditMode, !!hl));
    }
    if (map.getLayer('roads')) {
      // Only category mode damps roads globally. Under a SELECTION the roads
      // inside the selected country must stay at full strength — the mask sits
      // above the roads layer and dims the neighbours' roads for us.
      map.setPaintProperty('roads', 'line-opacity', roadOpacityExpr(hl?.kind === 'category', hl?.kind === 'selection'));
      map.setPaintProperty('roads', 'line-width', roadWidthExpr(hl?.kind === 'selection'));
    }
  }

  // recolor on driving-side toggle / coverage-edit mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setPaintProperty('countries-fill', 'fill-color', fillColorExpr(colorBySide));
    map.setPaintProperty('countries-outline', 'line-color', borderColorExpr(colorBySide));
    syncDotPaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorBySide, coverageEditMode]);

  // roads overlay toggle (lazily created on first enable)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (showRoads) {
      ensureRoadsLayer(map);
      if (map.getLayer('roads')) map.setLayoutProperty('roads', 'visibility', 'visible');
    } else if (map.getLayer('roads')) {
      map.setLayoutProperty('roads', 'visibility', 'none');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoads]);

  // experimental SV coverage overlay toggle (layer added at load, tiles fetched
  // only while visible)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current || !map.getLayer('sv-coverage')) return;
    map.setLayoutProperty('sv-coverage', 'visibility', showSvCoverage ? 'visible' : 'none');
  }, [showSvCoverage]);

  // ---- active dots for hovered/selected country ----------------------------
  function setActivePartsFor(a3: string | null) {
    const map = mapRef.current;
    if (!map) return;
    if (activePartsRef.current && activePartsRef.current !== a3) {
      for (const id of partIdsRef.current.get(activePartsRef.current) ?? []) {
        map.setFeatureState({ source: 'parts', id }, { active: false });
      }
    }
    activePartsRef.current = a3;
    if (a3) {
      for (const id of partIdsRef.current.get(a3) ?? []) {
        // main part's dot is redundant with its visible fill; show only the others
        const isMain = id.endsWith('#0');
        map.setFeatureState({ source: 'parts', id }, { active: !isMain });
      }
    }
  }
  useEffect(() => {
    if (loadedRef.current) setActivePartsFor(selectedA3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedA3]);

  // ---- regions ($ same as V1) ----------------------------------------------
  function applyRegionState() {
    const map = mapRef.current;
    if (!map || !map.getSource('regions')) return;
    for (const f of regions?.features ?? []) {
      const id = f.properties.region_id;
      map.setFeatureState({ source: 'regions', id }, {
        hasNotes: regionsWithNotes.has(id),
        filtered: regionFilter === id,
        dim: !!regionFilter && regionFilter !== id,
        picked: pickMode && pickSelected.has(id),
      });
    }
  }
  function applyRegionStateWhenReady() {
    const map = mapRef.current;
    if (!map) return;
    if (map.isSourceLoaded('regions')) return applyRegionState();
    const h = (e: maplibregl.MapSourceDataEvent) => {
      if (e.sourceId === 'regions' && map.isSourceLoaded('regions')) {
        map.off('sourcedata', h);
        applyRegionState();
      }
    };
    map.on('sourcedata', h);
  }
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const src = map.getSource('regions') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    hoveredRegionRef.current = null;
    regionNamesRef.current.clear();
    if (regions) {
      for (const f of regions.features) regionNamesRef.current.set(f.properties.region_id, f.properties.name);
      src.setData(regions as unknown as GeoJSON.FeatureCollection);
      regionsActiveRef.current = true;
      applyRegionStateWhenReady();
    } else {
      src.setData(EMPTY_FC);
      regionsActiveRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions]);
  useEffect(() => {
    if (loadedRef.current && regionsActiveRef.current) applyRegionState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionsWithNotes, regionFilter, pickMode, pickSelected]);

  // ---- fit target (default fit, part/cue zooms) or world restore -----------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const doFit = () => {
      if (fitTarget) {
        const [w, s, e, n] = fitTarget.box;
        map.fitBounds([[w, s], [e, n]], {
          padding: { top: 60, bottom: 60, left: 60, right: panelWidth + 40 },
          maxZoom: 6.5,
          duration: 900,
        });
      } else {
        map.easeTo({ center: WORLD_CENTER, zoom: WORLD_ZOOM, duration: 700 });
      }
    };
    if (loadedRef.current) doFit();
    else map.once('load', doFit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTarget]);

  return (
    <>
      <div ref={containerRef} className="map-root" />
      <div ref={tooltipRef} className="country-tooltip" />
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}
