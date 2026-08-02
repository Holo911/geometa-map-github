// ============================================================================
// GeoMeta Map — colour system (single source of truth)
// ============================================================================
// Every map colour lives here. WorldMap paint expressions, MapLegend swatches,
// the country ID card's driving-side tiles and the CSS chrome all read these
// tokens, so the legend can never drift from what the map actually renders.
//
// Design rules (V3):
//   1. Two clean hue families — right-hand traffic is BLUE, left-hand is VIOLET.
//      A country never leaves its family: hovering a LHT country brightens it
//      within violet, never to blue. This is what makes driving side readable
//      at a glance.
//      Left-hand traffic used to be CORAL, which collided head-on with tags:
//      a "red plates" tag paints its countries red, and red already meant
//      "drives left". Violet is the one region of the wheel no plate or sign
//      clue ever lands in, so the two meanings can never be confused. Keep it
//      that way — see TAG_COLORS in EntryEditor, which deliberately offers no
//      violet.
//   2. The ocean stays near-black. It is the contrast floor that lets the
//      saturated land fills pop instead of feeling washed out.
//   3. "Limited" coverage reads LIGHTER + desaturated + dashed — a faded
//      version of its family, never a darker mud (darker read as "uncovered").
//   4. Roads are warm yellow; admin-1 borders are cool light. That contrast is
//      the road-vs-border disambiguator.

export interface SidePalette {
  /** base fill, full coverage */
  full: string;
  /** full coverage + has notes (brightened) */
  notes: string;
  /** polygon border */
  border: string;
  /** hover fill — same hue family as `full` */
  hover: string;
  /** hover border */
  hoverBorder: string;
  /** limited coverage fill (lighter + desaturated) */
  limited: string;
  /** limited coverage dashed border */
  limitedLine: string;
}

/** Right-hand traffic — blue family. */
export const RHT: SidePalette = {
  full: '#3a6ea8',
  notes: '#4c86c4',
  border: '#6fa3d4',
  hover: '#63b3ff',
  hoverBorder: '#cfe8ff',
  limited: '#54718c',
  limitedLine: '#8fb0cc',
};

/** Left-hand traffic — violet family. */
export const LHT: SidePalette = {
  full: '#8f57c0',
  notes: '#a56ed6',
  border: '#c19ae0',
  hover: '#c98cff',
  hoverBorder: '#ecd9ff',
  limited: '#7a628f',
  limitedLine: '#b8a0cc',
};

/** Driving-side colouring OFF — one coherent blue, same brightness spirit. */
export const UNIFORM: SidePalette = {
  full: '#3f5f8a',
  notes: '#5479ab',
  border: '#7c9cc4',
  hover: '#63b3ff',
  hoverBorder: '#cfe8ff',
  limited: '#54718c',
  limitedLine: '#8fb0cc',
};

export const MAP = {
  /** contrast floor — everything else is brighter than this */
  ocean: '#070b12',
  uncovered: '#262b33',
  uncoveredBorder: '#333a44',
  /** amber "you have notes here" outline */
  notesOutline: '#ffd085',
  notesOutlineWidth: 1.8,
  /** offline road network — warm yellow, deliberately loud */
  road: '#ffd166',
  /** dark keyline around the tiny-part dots */
  dotStroke: '#05070b',
  /** category/tag spotlight */
  highlightDefault: '#4cc2ff',
  spotlightMask: '#090c11',
  /** how hard non-spotlit land is dimmed, and the lift given to a hovered
   *  neighbour so it still reads as clickable through the dim */
  spotlightDim: 0.66,
  spotlightDimHover: 0.3,
  /** Thick bright edge around the SELECTED country. Deliberately near-white
   *  rather than the notes-amber — amber already means "has notes", and two
   *  meanings on one outline is how you get a map nobody can read. */
  selectionOutline: '#f2f8ff',
  selectionOutlineWidth: 3,
  /** dark under-stroke beneath it, so the edge stays crisp over bright fills
   *  as well as over the dimmed neighbours */
  selectionOutlineHalo: '#0a0f16',
  selectionOutlineHaloWidth: 5.5,
} as const;

/**
 * Admin-1 region tint for the SELECTED country, kept in its driving-side hue
 * family so drilling into a country doesn't change what family it reads as.
 * Only one country's regions are ever on screen, so this is applied by
 * setPaintProperty when the selection changes.
 */
// Region *borders* are deliberately DARKER than the region fill, not lighter.
// A pale line on a now-bright fill washes out and the subdivisions read as one
// blob — the same trap M11 hit with country borders on brighter land.
export const REGION_TINT = {
  right: { base: '#79b0e8', line: '#204568' },
  left: { base: '#cfa3e8', line: '#3f1f5c' },
  uniform: { base: '#8fb2d6', line: '#26445f' },
} as const;

/** admin-1 regions of the selected country. */
export const REGION = {
  base: '#8ba5c4',
  hasNotes: '#ffb069',
  hover: '#6fc8ff',
  filtered: '#ffc98d',
  picked: '#6ff0b4',
  line: '#a8c0dc',
  lineHover: '#dff2ff',
} as const;

/** UI chrome accents that must match the map. */
export const UI = {
  accent: '#4cc2ff',
  accentStrong: '#7dd3fc',
  accentWarm: '#ffb069',
} as const;

/** Pick the palette for a driving side (or the uniform one when colouring is off). */
export function sidePalette(side: 'left' | 'right', colorBySide: boolean): SidePalette {
  if (!colorBySide) return UNIFORM;
  return side === 'left' ? LHT : RHT;
}

/**
 * Mirror the tokens onto CSS custom properties so stylesheet chrome (legend,
 * chips, toolbar) uses the exact same values as the WebGL map. Called once at
 * startup.
 */
export function applyPaletteVars(root: HTMLElement = document.documentElement) {
  const vars: Record<string, string> = {
    '--map-ocean': MAP.ocean,
    '--map-uncovered': MAP.uncovered,
    '--map-uncovered-border': MAP.uncoveredBorder,
    '--map-notes-outline': MAP.notesOutline,
    '--map-road': MAP.road,

    '--map-rht': RHT.full,
    '--map-rht-notes': RHT.notes,
    '--map-rht-border': RHT.border,
    '--map-rht-hover': RHT.hover,
    '--map-rht-limited': RHT.limited,
    '--map-rht-limited-line': RHT.limitedLine,

    '--map-lht': LHT.full,
    '--map-lht-notes': LHT.notes,
    '--map-lht-border': LHT.border,
    '--map-lht-hover': LHT.hover,
    '--map-lht-limited': LHT.limited,
    '--map-lht-limited-line': LHT.limitedLine,

    '--map-uniform': UNIFORM.full,
    '--map-uniform-border': UNIFORM.border,

    '--accent': UI.accent,
    '--accent-strong': UI.accentStrong,
    '--accent-warm': UI.accentWarm,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
