// Shared types for the client.

export interface CountryProps {
  a3: string;
  a2: string;
  name: string;
  continent: string;
  /** [west, south, east, north] — the map view to fit when this country is selected. */
  view: [number, number, number, number];
}

export interface CountryFeature {
  type: 'Feature';
  id?: string;
  properties: CountryProps;
  geometry: unknown;
}

export interface CountryFC {
  type: 'FeatureCollection';
  features: CountryFeature[];
}

export interface RegionProps {
  adm0_a3: string;
  region_id: string;
  name: string;
}

export interface RegionFeature {
  type: 'Feature';
  id?: string;
  properties: RegionProps;
  geometry: unknown;
}

export interface RegionFC {
  type: 'FeatureCollection';
  features: RegionFeature[];
}

// ---- API model ----

export interface Category {
  id: number;
  name: string;
  emoji: string | null;
  sort: number | null;
  is_default: number;
}

export interface EntryImage {
  id: number;
  file: string;
  url: string;
  caption: string;
  sort: number;
}

export type Scope = 'country' | 'regions';

export interface Tag {
  id: number;
  name: string;
  color: string;
  sort: number | null;
}

export interface Entry {
  id: number;
  a3: string;
  category_id: number;
  title: string;
  body_md: string;
  scope: Scope;
  created_at: string;
  updated_at: string;
  region_ids: string[];
  tag_ids: number[];
  images: EntryImage[];
}

export type Tier = 'full' | 'limited' | 'none';

export interface CoverageEntry {
  tier: Tier;
}

export interface EntryCount {
  total: number;
  byCategory: Record<number, number>;
  tagIds: number[];
}

export interface Bootstrap {
  categories: Category[];
  tags: Tag[];
  coverage: Record<string, CoverageEntry>;
  settings: Record<string, string>;
  entryCounts: Record<string, EntryCount>;
  /** a3 -> { kind -> image url }, e.g. { COL: { alphabet: '/images/…' } } */
  countryMedia: Record<string, Record<string, string>>;
}

/** A script/alphabet sample shown when a country has no alphabet image set. */
export interface ScriptInfo {
  script: string;
  sample: string;
  note?: string;
  /** Japanese equivalents, co-located with the script data itself. */
  script_ja?: string;
  note_ja?: string;
  /** Latin-script country where only the diacritics are the tell. */
  latin?: boolean;
}

export type Side = 'left' | 'right';

export interface CountryFacts {
  native: string;
  /** Japanese country name (world-countries translations.jpn.common). */
  name_ja?: string;
  langs: string[];
  currency: string | null;
  tld: string | null;
  phone: string | null;
  side: Side;
}

export interface CountryPart {
  bbox: [number, number, number, number];
  centroid: [number, number];
  area_km2: number;
  label: string;
  main: boolean;
}

export interface CountryPartsInfo {
  micro: boolean;
  parts: CountryPart[];
}

export type PartsData = Record<string, CountryPartsInfo>;
export type FactsData = Record<string, CountryFacts>;

export interface TerritoryRef {
  a3: string;
  name: string;
  tier: Tier;
}

