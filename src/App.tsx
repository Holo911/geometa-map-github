import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WorldMap, { type Spotlight, type UncoveredMode } from './map/WorldMap';
import MapLegend from './map/MapLegend';
import { MAP } from './map/palette';
import { resolveLang, setLang, useT, type Lang } from './i18n';
import { countryName } from './lib/countryName';
import { useAdmin1 } from './map/useAdmin1';
import CountryPanel from './panel/CountryPanel';
import EntryEditor, { type RegionOption } from './panel/EntryEditor';
import Lightbox from './panel/Lightbox';
import CategoryRail, { type RailSelection } from './panel/CategoryRail';
import CountrySearch from './search/CountrySearch';
import SettingsModal from './settings/SettingsModal';
import OffscreenCue from './map/OffscreenCue';
import { api } from './lib/api';
import { computeDefaultFit, unionBbox, bboxContains, type BBox } from './lib/parts';
import factsJson from './data/country-facts.json';
import overridesJson from './data/view-overrides.json';
import territoriesJson from './data/territories.json';
import type {
  Bootstrap,
  CountryFC,
  CountryPart,
  CountryProps,
  Entry,
  EntryImage,
  FactsData,
  PartsData,
  Side,
  TerritoryRef,
  Tier,
} from './lib/types';

const facts = factsJson as unknown as FactsData;
const viewOverrides = overridesJson as unknown as Record<string, BBox>;
const territoriesMap = territoriesJson as Record<string, string[]>;
const parentOfTerritory: Record<string, string> = {};
for (const [parent, terrs] of Object.entries(territoriesMap)) {
  for (const t of terrs) parentOfTerritory[t] = parent;
}

interface FitTarget {
  box: BBox;
  nonce: number;
}

interface EditorState {
  categoryId: number;
  entry: Entry | null;
}
interface LightboxState {
  images: EntryImage[];
  index: number;
}

export default function App() {
  const t = useT();
  const [countries, setCountries] = useState<CountryFC | null>(null);
  const [parts, setParts] = useState<PartsData>({});
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selectedA3, setSelectedA3] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [panelWidth, setPanelWidth] = useState(560);
  const [studyMode, setStudyMode] = useState(false);

  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorRegionIds, setEditorRegionIds] = useState<string[]>([]);
  const [editorPickMode, setEditorPickMode] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coverageEditMode, setCoverageEditMode] = useState(false);

  const [mode, setMode] = useState<'country' | 'category'>('country');
  const [railSelection, setRailSelection] = useState<RailSelection>(null);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);

  const [fitTarget, setFitTarget] = useState<FitTarget | null>(null);
  const [viewport, setViewport] = useState<BBox | null>(null);

  const entriesReqId = useRef(0);
  const fitNonce = useRef(0);
  const zoomTo = useCallback((box: BBox) => {
    setFitTarget({ box, nonce: ++fitNonce.current });
  }, []);

  // ---- initial load ----
  useEffect(() => {
    Promise.all([
      fetch('/geo/countries.geo.json').then((r) => {
        if (!r.ok) throw new Error(`countries.geo.json ${r.status}`);
        return r.json() as Promise<CountryFC>;
      }),
      fetch('/geo/parts.json').then((r) => (r.ok ? (r.json() as Promise<PartsData>) : {})),
      api.bootstrap(),
    ])
      .then(([fc, pj, b]) => {
        setCountries(fc);
        setParts(pj);
        setBoot(b);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // panel width: load persisted value once, then persist changes (debounced)
  const widthLoaded = useRef(false);
  useEffect(() => {
    if (boot && !widthLoaded.current) {
      widthLoaded.current = true;
      const w = parseInt(boot.settings.panelWidth ?? '', 10);
      if (w >= 380 && w <= 820) setPanelWidth(w);
    }
  }, [boot]);
  useEffect(() => {
    if (!widthLoaded.current) return;
    const timer = setTimeout(
      () => api.putSetting('panelWidth', String(panelWidth)).catch(() => {}),
      600
    );
    return () => clearTimeout(timer);
  }, [panelWidth]);

  // Language: the stored `lang` setting wins; until boot arrives (and on a fresh
  // profile where it's unset) the navigator default applies — so a Japanese
  // browser shows Japanese with zero configuration.
  const lang = resolveLang(boot?.settings?.lang);
  useEffect(() => {
    setLang(lang);
  }, [lang]);

  const settings = boot?.settings ?? {};
  const colorBySide = settings.colorBySide !== 'off';
  const limitedAsUncovered = settings.limitedAsUncovered === 'on';
  const uncoveredMode = (settings.uncoveredMode as UncoveredMode) || 'dim';
  const showRoads = settings.roadsLayer === 'on';
  const showSvCoverage = settings.svOverlay === 'on';

  // effective coverage tier per a3 (limited dropped when the setting treats it as uncovered)
  const coverage = useMemo(() => {
    const m = new Map<string, Tier>();
    if (boot) {
      for (const [a3, v] of Object.entries(boot.coverage)) {
        if (v.tier === 'limited' && limitedAsUncovered) continue;
        if (v.tier !== 'none') m.set(a3, v.tier);
      }
    }
    return m;
  }, [boot, limitedAsUncovered]);

  const sideOf = useMemo(() => {
    const m = new Map<string, Side>();
    for (const [a3, f] of Object.entries(facts)) m.set(a3, f.side);
    return m;
  }, []);

  const propsByA3 = useMemo(() => {
    const m = new Map<string, CountryProps>();
    if (countries) for (const f of countries.features) m.set(f.properties.a3, f.properties);
    return m;
  }, [countries]);

  const allCountryProps = useMemo(
    () => (countries ? countries.features.map((f) => f.properties) : []),
    [countries]
  );

  // ---- parts / smart fit / territories (M7) ----
  const selectedParts = useMemo<CountryPart[]>(
    () => (selectedA3 ? parts[selectedA3]?.parts ?? [] : []),
    [selectedA3, parts]
  );

  useEffect(() => {
    if (!selectedA3) {
      setFitTarget(null);
      return;
    }
    const box =
      computeDefaultFit(parts[selectedA3]?.parts ?? [], viewOverrides[selectedA3]) ??
      (propsByA3.get(selectedA3)?.view as BBox | undefined) ??
      null;
    setFitTarget(box ? { box, nonce: ++fitNonce.current } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedA3, parts]);

  const allPartsBox = useMemo<BBox | null>(
    () => unionBbox(selectedParts.map((p) => p.bbox as BBox)),
    [selectedParts]
  );

  const territories = useMemo<TerritoryRef[]>(() => {
    if (!selectedA3) return [];
    return (territoriesMap[selectedA3] ?? [])
      .map((a3) => ({
        a3,
        name: propsByA3.get(a3)?.name ?? a3,
        tier: (coverage.get(a3) ?? 'none') as Tier,
      }))
      .filter((terr) => terr.tier !== 'none');
  }, [selectedA3, coverage, propsByA3]);

  const parentRef = useMemo(() => {
    if (!selectedA3) return null;
    const p = parentOfTerritory[selectedA3];
    return p ? { a3: p, name: propsByA3.get(p)?.name ?? p } : null;
  }, [selectedA3, propsByA3]);

  const offscreenParts = useMemo<CountryPart[]>(() => {
    if (!selectedA3 || !viewport) return [];
    return selectedParts.filter((p) => !bboxContains(viewport, p.centroid, 0.3));
  }, [selectedA3, viewport, selectedParts]);

  const categories = boot?.categories ?? [];
  const tags = useMemo(() => boot?.tags ?? [], [boot]);

  // per-country total (map/search/tooltip) + rail aggregates
  const entryTotals = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    if (boot) for (const [a3, v] of Object.entries(boot.entryCounts)) m[a3] = v.total;
    return m;
  }, [boot]);
  const categoryCounts = useMemo<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    if (boot)
      for (const v of Object.values(boot.entryCounts))
        for (const [cid, n] of Object.entries(v.byCategory)) m[+cid] = (m[+cid] ?? 0) + n;
    return m;
  }, [boot]);
  const tagCountryCounts = useMemo<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    if (boot) for (const v of Object.values(boot.entryCounts)) for (const t of v.tagIds) m[t] = (m[t] ?? 0) + 1;
    return m;
  }, [boot]);

  // What the map spotlights. A selected country wins: while it's open,
  // everything else dims so its national border is unmistakable. Dropping the
  // selection falls back to whatever category/tag spotlight was underneath.
  const highlight = useMemo<Spotlight | null>(() => {
    if (selectedA3) return { ids: new Set([selectedA3]), color: null, kind: 'selection' };
    if (mode !== 'category' || !railSelection || !boot) return null;
    const ids = new Set<string>();
    if (railSelection.type === 'category') {
      for (const [a3, v] of Object.entries(boot.entryCounts))
        if ((v.byCategory[railSelection.id] ?? 0) > 0) ids.add(a3);
      return { ids, color: MAP.highlightDefault, kind: 'category' };
    }
    for (const [a3, v] of Object.entries(boot.entryCounts))
      if (v.tagIds.includes(railSelection.id)) ids.add(a3);
    return {
      ids,
      color: tags.find((tag) => tag.id === railSelection.id)?.color ?? MAP.highlightDefault,
      kind: 'category',
    };
  }, [selectedA3, mode, railSelection, boot, tags]);

  // Countries carrying the active category/tag, for the rail's list. Computed
  // separately from `highlight` on purpose: opening a country replaces the
  // spotlight, but the list has to stay put — you're working through it.
  const railCountries = useMemo(() => {
    if (mode !== 'category' || !railSelection || !boot) return [];
    const out: { a3: string; name: string }[] = [];
    for (const [a3, v] of Object.entries(boot.entryCounts)) {
      const hit =
        railSelection.type === 'category'
          ? (v.byCategory[railSelection.id] ?? 0) > 0
          : v.tagIds.includes(railSelection.id);
      if (hit) out.push({ a3, name: countryName(a3, propsByA3.get(a3)?.name ?? a3, lang) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, lang));
  }, [mode, railSelection, boot, propsByA3, lang]);

  // ---- admin-1 regions for the selected country (lazy + cached) ----
  const { regions: admin1 } = useAdmin1(selectedA3);

  const regionOptions = useMemo<RegionOption[]>(() => {
    if (!admin1) return [];
    const seen = new Set<string>();
    const out: RegionOption[] = [];
    for (const f of admin1.features) {
      const id = f.properties.region_id;
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push({ id, name: f.properties.name });
      }
    }
    return out;
  }, [admin1]);

  const regionNameOf = useCallback(
    (id: string) => regionOptions.find((r) => r.id === id)?.name ?? id,
    [regionOptions]
  );

  const regionsWithNotes = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) if (e.scope === 'regions') for (const r of e.region_ids) s.add(r);
    return s;
  }, [entries]);

  // ---- entries ----
  const loadEntries = useCallback(async (a3: string) => {
    const reqId = ++entriesReqId.current;
    setEntriesLoading(true);
    try {
      const list = await api.getEntries(a3);
      if (reqId === entriesReqId.current) setEntries(list);
    } catch (e) {
      if (reqId === entriesReqId.current) setError(String(e));
    } finally {
      if (reqId === entriesReqId.current) setEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    setRegionFilter(null);
    if (selectedA3) {
      setEntries([]);
      loadEntries(selectedA3);
    } else {
      setEntries([]);
    }
  }, [selectedA3, loadEntries]);

  // recompute the entryCounts entry for one country from its entry list, so the
  // map tint, rail counts, and highlights stay live after edits
  const setCountFor = useCallback((a3: string, list: Entry[]) => {
    setBoot((prev) => {
      if (!prev) return prev;
      const entryCounts = { ...prev.entryCounts };
      if (list.length === 0) {
        delete entryCounts[a3];
      } else {
        const byCategory: Record<number, number> = {};
        const tagSet = new Set<number>();
        for (const e of list) {
          byCategory[e.category_id] = (byCategory[e.category_id] ?? 0) + 1;
          for (const t of e.tag_ids) tagSet.add(t);
        }
        entryCounts[a3] = { total: list.length, byCategory, tagIds: [...tagSet] };
      }
      return { ...prev, entryCounts };
    });
  }, []);

  const refreshEntries = useCallback(
    async (a3: string) => {
      const list = await api.getEntries(a3);
      setEntries(list);
      setCountFor(a3, list);
      return list;
    },
    [setCountFor]
  );

  // ---- handlers ----
  const closePanel = useCallback(() => {
    setSelectedA3(null);
    setEditor(null);
    setEditorPickMode(false);
    setLightbox(null);
    setStudyMode(false);
    setCategoryFilter(null);
  }, []);

  // selecting a country from the map/search/territory: in category mode with a
  // category active, pre-filter the panel to that category.
  const selectCountry = useCallback(
    (a3: string) => {
      setSelectedA3(a3);
      setCategoryFilter(
        mode === 'category' && railSelection?.type === 'category' ? railSelection.id : null
      );
    },
    [mode, railSelection]
  );

  const switchMode = useCallback((next: 'country' | 'category') => {
    setMode(next);
    setRailSelection(null);
    setCategoryFilter(null);
    setSelectedA3(null);
    setStudyMode(false);
  }, []);

  const onRailSelect = useCallback((sel: RailSelection) => {
    setRailSelection(sel);
    setCategoryFilter(null);
    setSelectedA3(null);
  }, []);

  const openEditor = useCallback((categoryId: number, entry: Entry | null) => {
    setEditorRegionIds(entry?.region_ids ?? []);
    setEditorPickMode(false);
    setEditor({ categoryId, entry });
  }, []);

  const closeEditor = useCallback(() => {
    setEditor(null);
    setEditorPickMode(false);
  }, []);

  const handleDelete = useCallback(
    async (entry: Entry) => {
      try {
        await api.deleteEntry(entry.id);
        if (selectedA3) await refreshEntries(selectedA3);
      } catch (e) {
        setError(String(e));
      }
    },
    [selectedA3, refreshEntries]
  );

  const handleSaved = useCallback(async () => {
    closeEditor();
    if (selectedA3) await refreshEntries(selectedA3);
  }, [selectedA3, refreshEntries, closeEditor]);

  const onRegionMapClick = useCallback(
    (regionId: string) => {
      if (editor && editorPickMode) {
        setEditorRegionIds((prev) =>
          prev.includes(regionId) ? prev.filter((r) => r !== regionId) : [...prev, regionId]
        );
      } else {
        setRegionFilter((prev) => (prev === regionId ? null : regionId));
      }
    },
    [editor, editorPickMode]
  );

  const pickSelected = useMemo(() => new Set(editorRegionIds), [editorRegionIds]);

  // ---- coverage editing (cycles full -> limited -> none) ----
  const enterCoverageEdit = useCallback(() => {
    setSettingsOpen(false);
    setSelectedA3(null);
    setCoverageEditMode(true);
  }, []);

  // The PUT is fired outside the updater on purpose: a setState updater has to
  // be pure. React re-invokes updaters (StrictMode does it deliberately), so a
  // request in there gets sent twice per click.
  const bootRef = useRef<Bootstrap | null>(null);
  bootRef.current = boot;
  const onCycleCoverage = useCallback((a3: string) => {
    const prev = bootRef.current;
    if (!prev) return;
    const cur: Tier = prev.coverage[a3]?.tier ?? 'none';
    const next: Tier = cur === 'full' ? 'limited' : cur === 'limited' ? 'none' : 'full';
    api.putCoverage(a3, next).catch((e) => setError(String(e)));
    setBoot((b) => {
      if (!b) return b;
      const coverage = { ...b.coverage };
      if (next === 'none') delete coverage[a3];
      else coverage[a3] = { tier: next };
      return { ...b, coverage };
    });
  }, []);

  // ---- per-country alphabet chart ----
  const setAlphabet = useCallback(async (a3: string, file: File) => {
    try {
      const res = await api.putCountryMedia(a3, 'alphabet', file);
      setBoot((prev) =>
        prev
          ? {
              ...prev,
              countryMedia: { ...prev.countryMedia, [a3]: { ...prev.countryMedia?.[a3], alphabet: res.url } },
            }
          : prev
      );
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const removeAlphabet = useCallback(async (a3: string) => {
    try {
      await api.deleteCountryMedia(a3, 'alphabet');
      setBoot((prev) => {
        if (!prev) return prev;
        const media = { ...prev.countryMedia };
        const forCountry = { ...media[a3] };
        delete forCountry.alphabet;
        if (Object.keys(forCountry).length) media[a3] = forCountry;
        else delete media[a3];
        return { ...prev, countryMedia: media };
      });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // ---- settings ----
  const setSetting = useCallback((key: string, value: string) => {
    setBoot((prev) => (prev ? { ...prev, settings: { ...prev.settings, [key]: value } } : prev));
    api.putSetting(key, value).catch((e) => setError(String(e)));
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      setBoot(await api.bootstrap());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const onImported = useCallback(
    async (backupName: string) => {
      setSettingsOpen(false);
      setSelectedA3(null);
      await refreshBootstrap();
      setToast(t('toast.imported', { name: backupName }));
    },
    [refreshBootstrap]
  );

  // ---- global keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        if (!editor && !lightbox && !settingsOpen) {
          e.preventDefault();
          setSearchOpen(true);
        }
        return;
      }
      // F toggles study mode (ignore while typing / a modal is up)
      if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (selectedA3 && !editor && !lightbox && !searchOpen && !settingsOpen && !coverageEditMode) {
          e.preventDefault();
          setStudyMode((s) => !s);
        }
        return;
      }
      if (e.key === 'Escape') {
        if (lightbox || editor) return;
        if (searchOpen) return;
        if (settingsOpen) {
          e.preventDefault();
          setSettingsOpen(false);
          return;
        }
        if (coverageEditMode) {
          e.preventDefault();
          setCoverageEditMode(false);
          return;
        }
        if (studyMode) {
          e.preventDefault();
          setStudyMode(false);
          return;
        }
        if (regionFilter) {
          e.preventDefault();
          setRegionFilter(null);
          return;
        }
        if (selectedA3) {
          e.preventDefault();
          closePanel();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, editor, searchOpen, settingsOpen, coverageEditMode, studyMode, regionFilter, selectedA3, closePanel]);

  const selectedProps = selectedA3 ? propsByA3.get(selectedA3) : undefined;
  const selectedTier = selectedA3 ? coverage.get(selectedA3) : undefined;

  return (
    <div className="app">
      {countries && boot && (
        <WorldMap
          countries={countries}
          coverage={coverage}
          sideOf={sideOf}
          entryCounts={entryTotals}
          colorBySide={colorBySide}
          partsData={parts}
          selectedA3={selectedA3}
          uncoveredMode={uncoveredMode}
          panelWidth={selectedA3 ? panelWidth : 0}
          regions={admin1}
          regionsWithNotes={regionsWithNotes}
          regionFilter={regionFilter}
          pickMode={!!editor && editorPickMode}
          pickSelected={pickSelected}
          coverageEditMode={coverageEditMode}
          showRoads={showRoads}
          showSvCoverage={showSvCoverage}
          fitTarget={fitTarget}
          highlight={highlight}
          onSelect={selectCountry}
          onRegionMapClick={onRegionMapClick}
          onCycleCoverage={onCycleCoverage}
          onZoomPart={zoomTo}
          nameOf={(a3, fallback) => countryName(a3, fallback, lang)}
          onViewportChange={setViewport}
          onMapReady={(m) => {
            if (import.meta.env.DEV) (window as unknown as { __map: unknown }).__map = m;
          }}
        />
      )}

      <div className="hud">
        <h1>
          <span className="dot" />
          GeoMeta Map
        </h1>
        {boot && (
          <div className="mode-toggle segmented">
            <button className={mode === 'country' ? 'active' : ''} onClick={() => switchMode('country')}>
              {t('hud.byCountry')}
            </button>
            <button className={mode === 'category' ? 'active' : ''} onClick={() => switchMode('category')}>
              {t('hud.byCategory')}
            </button>
          </div>
        )}
      </div>

      {boot && mode === 'category' && (
        <CategoryRail
          categories={categories}
          tags={tags}
          categoryCounts={categoryCounts}
          tagCountryCounts={tagCountryCounts}
          selection={railSelection}
          onSelect={onRailSelect}
          countries={railCountries}
          selectedA3={selectedA3}
          onSelectCountry={selectCountry}
        />
      )}

      {boot && (
        <MapLegend
          colorBySide={colorBySide}
          showLimited={!limitedAsUncovered}
          railOpen={mode === 'category'}
        />
      )}

      {boot && (
        <div className="toolbar">
          <button className="tool-btn" onClick={() => setSearchOpen(true)} title={t('toolbar.searchTitle')}>
            🔍<span className="tool-label">{t('toolbar.search')}</span>
          </button>
          <button
            className={`tool-btn${showRoads ? ' active' : ''}`}
            onClick={() => setSetting('roadsLayer', showRoads ? 'off' : 'on')}
            title={t('toolbar.roadsTitle')}
          >
            🛣<span className="tool-label">{t('toolbar.roads')}</span>
          </button>
          <button className="tool-btn" onClick={() => setSettingsOpen(true)} title={t('toolbar.settings')}>
            ⚙<span className="tool-label">{t('toolbar.settings')}</span>
          </button>
        </div>
      )}

      {coverageEditMode && (
        <div className="coverage-banner">
          <span>{t('coverage.banner')}</span>
          <button className="btn btn-primary" onClick={() => setCoverageEditMode(false)}>
            {t('common.done')}
          </button>
        </div>
      )}

      {selectedProps && !coverageEditMode && !studyMode && offscreenParts.length > 0 && (
        <OffscreenCue parts={offscreenParts} onZoom={zoomTo} />
      )}

      {selectedProps && boot && !coverageEditMode && (
        <CountryPanel
          key={selectedProps.a3}
          country={selectedProps}
          facts={facts[selectedProps.a3]}
          tier={selectedTier}
          categories={categories}
          entries={entries}
          loading={entriesLoading}
          width={panelWidth}
          onWidth={setPanelWidth}
          studyMode={studyMode}
          onToggleStudy={() => setStudyMode((s) => !s)}
          regionFilter={regionFilter}
          onClearRegionFilter={() => setRegionFilter(null)}
          regionNameOf={regionNameOf}
          categoryFilter={categoryFilter}
          onClearCategoryFilter={() => setCategoryFilter(null)}
          tags={tags}
          alphabetUrl={boot.countryMedia?.[selectedProps.a3]?.alphabet}
          onSetAlphabet={(file) => setAlphabet(selectedProps.a3, file)}
          onRemoveAlphabet={() => removeAlphabet(selectedProps.a3)}
          parts={selectedParts}
          allPartsBox={allPartsBox}
          offscreenLabels={new Set(offscreenParts.map((p) => p.label))}
          onZoomPart={(box) => zoomTo(box)}
          territories={territories}
          parent={parentRef}
          onSelectCountry={selectCountry}
          onClose={closePanel}
          onAddNote={(categoryId) => openEditor(categoryId, null)}
          onEditEntry={(entry) => openEditor(entry.category_id, entry)}
          onDeleteEntry={handleDelete}
          onOpenLightbox={(images, index) => setLightbox({ images, index })}
        />
      )}

      {editor && selectedA3 && (
        <EntryEditor
          a3={selectedA3}
          categories={categories}
          initialCategoryId={editor.categoryId}
          entry={editor.entry}
          tags={tags}
          onTagsChanged={refreshBootstrap}
          regionOptions={regionOptions.length ? regionOptions : undefined}
          regionIds={editorRegionIds}
          onRegionIdsChange={setEditorRegionIds}
          mapPickActive={editorPickMode}
          onToggleMapPick={setEditorPickMode}
          onClose={closeEditor}
          onSaved={handleSaved}
        />
      )}

      {lightbox && (
        <Lightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndex={(index) => setLightbox((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setLightbox(null)}
        />
      )}

      {searchOpen && boot && (
        <CountrySearch
          countries={allCountryProps}
          coverage={coverage}
          entryCounts={entryTotals}
          onSelect={(a3) => {
            setCoverageEditMode(false);
            selectCountry(a3);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {settingsOpen && boot && (
        <SettingsModal
          lang={lang}
          onChangeLang={(l: Lang) => setSetting('lang', l)}
          uncoveredMode={uncoveredMode}
          colorBySide={colorBySide}
          limitedAsUncovered={limitedAsUncovered}
          svOverlay={showSvCoverage}
          categories={categories}
          onClose={() => setSettingsOpen(false)}
          onChangeUncoveredMode={(mode) => setSetting('uncoveredMode', mode)}
          onChangeColorBySide={(on) => setSetting('colorBySide', on ? 'on' : 'off')}
          onChangeLimitedAsUncovered={(on) => setSetting('limitedAsUncovered', on ? 'on' : 'off')}
          onChangeSvOverlay={(on) => setSetting('svOverlay', on ? 'on' : 'off')}
          onEnterCoverageEdit={enterCoverageEdit}
          onCategoriesChanged={refreshBootstrap}
          onImported={onImported}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {!countries && !error && (
        <div className="center-status">
          <span className="spinner" /> {t('common.loadingMap')}
        </div>
      )}
      {error && (
        <div className="toast toast-error" onClick={() => setError(null)}>
          {error} {t('common.dismiss')}
        </div>
      )}
    </div>
  );
}
