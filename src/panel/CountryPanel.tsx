import { useEffect, useState } from 'react';
import type {
  Category,
  CountryFacts,
  CountryPart,
  CountryProps,
  Entry,
  EntryImage,
  Tag,
  TerritoryRef,
  Tier,
} from '../lib/types';
import type { BBox } from '../lib/parts';
import { flagEmoji } from '../lib/flags';
import CountryIdCard from './CountryIdCard';
import { categoryLabel, useT } from '../i18n';
import { countryName } from '../lib/countryName';
import PanelFeed from './PanelFeed';

interface CountryPanelProps {
  country: CountryProps;
  facts?: CountryFacts;
  tier?: Tier;
  categories: Category[];
  entries: Entry[];
  loading: boolean;
  width: number;
  onWidth: (w: number) => void;
  studyMode: boolean;
  onToggleStudy: () => void;
  regionFilter?: string | null;
  onClearRegionFilter?: () => void;
  regionNameOf?: (id: string) => string;
  categoryFilter?: number | null;
  onClearCategoryFilter?: () => void;
  tags?: Tag[];
  /** user-supplied alphabet chart for this country, if set */
  alphabetUrl?: string;
  onSetAlphabet: (file: File) => void;
  onRemoveAlphabet: () => void;
  parts?: CountryPart[];
  allPartsBox?: BBox | null;
  offscreenLabels?: Set<string>;
  onZoomPart?: (box: BBox) => void;
  territories?: TerritoryRef[];
  parent?: { a3: string; name: string } | null;
  onSelectCountry?: (a3: string) => void;
  onClose: () => void;
  onAddNote: (categoryId: number) => void;
  onEditEntry: (entry: Entry) => void;
  onDeleteEntry: (entry: Entry) => void;
  onOpenLightbox: (images: EntryImage[], index: number) => void;
}

const flagClass = (a2: string) => (/^[A-Za-z]{2}$/.test(a2) ? `fi fi-${a2.toLowerCase()}` : '');

export default function CountryPanel(props: CountryPanelProps) {
  const {
    country,
    facts,
    tier,
    categories,
    entries,
    loading,
    width,
    onWidth,
    studyMode,
    onToggleStudy,
    regionFilter,
    onClearRegionFilter,
    regionNameOf,
    categoryFilter,
    onClearCategoryFilter,
    tags,
    alphabetUrl,
    onSetAlphabet,
    onRemoveAlphabet,
    parts,
    allPartsBox,
    offscreenLabels,
    onZoomPart,
    territories,
    parent,
    onSelectCountry,
    onClose,
    onAddNote,
    onEditEntry,
    onDeleteEntry,
    onOpenLightbox,
  } = props;

  const t = useT();
  const [resizing, setResizing] = useState(false);
  // parts.json emits two generic labels of our own ("Mainland" / "Islands");
  // every other label is an admin-1 region name and stays as-is.
  const partLabel = (label: string) =>
    label === 'Mainland' ? t('panel.mainland') : label === 'Islands' ? t('panel.islands') : label;
  const displayName = countryName(country.a3, country.name, t.lang);
  const fic = flagClass(country.a2);
  const emojiFlag = flagEmoji(country.a2);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => onWidth(Math.min(820, Math.max(380, window.innerWidth - e.clientX)));
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [resizing, onWidth]);

  const inner = (
    <>
      {parent && onSelectCountry && (
        <button className="panel-parent" onClick={() => onSelectCountry(parent.a3)}>
          {t('panel.partOf', { name: countryName(parent.a3, parent.name, t.lang) })}
        </button>
      )}

      {/* Identity zone: flag, name, the big constants and the alphabet. Styled as
          one block so the eye parses "country facts up here, my notes below". */}
      <div className="id-zone">
        <div className="panel-header">
          {fic ? <span className={`panel-flag-svg ${fic}`} /> : <span className="panel-flag">{emojiFlag}</span>}
          <div className="panel-title">
            <h2>{displayName}</h2>
            {facts && facts.native !== displayName && <div className="panel-native">{facts.native}</div>}
            <div className="count">
              {loading ? t('common.loading') : t.n('panel.noteCount', entries.length)}
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={onToggleStudy}
            title={studyMode ? t('panel.exitStudyMode') : t('panel.studyMode')}
          >
            {studyMode ? '⤡' : '⤢'}
          </button>
          <button className="icon-btn" onClick={onClose} title={t('panel.closeEsc')}>
            ✕
          </button>
        </div>

        <CountryIdCard
          a3={country.a3}
          facts={facts}
          tier={tier}
          alphabetUrl={alphabetUrl}
          studyMode={studyMode}
          onSetAlphabet={onSetAlphabet}
          onRemoveAlphabet={onRemoveAlphabet}
          onOpenImage={(url) =>
            onOpenLightbox(
              [{ id: -1, file: '', url, caption: t('alphabet.caption', { name: displayName }), sort: 0 }],
              0
            )
          }
        />
      </div>

      {parts && parts.length > 1 && onZoomPart && (
        <div className="panel-chips">
          {dedupeParts(parts).map((p) => (
            <button
              key={p.label}
              className={`part-chip ${offscreenLabels?.has(p.label) ? 'offscreen' : ''}`}
              onClick={() => onZoomPart(p.bbox as BBox)}
              title={offscreenLabels?.has(p.label) ? t('panel.offscreenZoom') : t('panel.zoomHere')}
            >
              {offscreenLabels?.has(p.label) && <span className="chip-badge">›</span>}
              {partLabel(p.label)}
            </button>
          ))}
          {allPartsBox && (
            <button className="part-chip all" onClick={() => onZoomPart(allPartsBox)}>
              {t('panel.allParts')}
            </button>
          )}
        </div>
      )}

      {territories && territories.length > 0 && onSelectCountry && (
        <div className="panel-chips terr">
          <span className="chips-label">{t('panel.territories')}</span>
          {territories.map((terr) => (
            <button key={terr.a3} className="part-chip terr-chip" onClick={() => onSelectCountry(terr.a3)}>
              {countryName(terr.a3, terr.name, t.lang)}
              {terr.tier === 'limited' && <span className="terr-lim">·ltd</span>}
            </button>
          ))}
        </div>
      )}

      {(regionFilter || categoryFilter != null) && (
        <div className="panel-filter-row">
          {regionFilter && (
            <span className="chip filter">
              📍 {regionNameOf ? regionNameOf(regionFilter) : regionFilter}
              <span className="x" onClick={onClearRegionFilter} title={t('panel.clearFilter')}>
                ✕
              </span>
            </span>
          )}
          {categoryFilter != null && (
            <span className="chip filter">
              {categories.find((c) => c.id === categoryFilter)?.emoji}{' '}
              {(() => {
                const c = categories.find((x) => x.id === categoryFilter);
                return c ? categoryLabel(t.lang, c) : '';
              })()}
              <span className="x" onClick={onClearCategoryFilter} title={t('panel.clearFilter')}>
                ✕
              </span>
            </span>
          )}
        </div>
      )}

      {/* hard break between "country constants" and "my notes" */}
      <div className="notes-divider">
        <span>{t('panel.notes')}</span>
      </div>

      <div className="panel-body">
        {loading ? (
          <div className="center-status" style={{ position: 'static', padding: 30 }}>
            <span className="spinner" /> Loading notes…
          </div>
        ) : (
          <PanelFeed
            categories={categories}
            entries={entries}
            tags={tags}
            regionFilter={regionFilter}
            categoryFilter={categoryFilter}
            regionNameOf={regionNameOf}
            onAddNote={onAddNote}
            onEditEntry={onEditEntry}
            onDeleteEntry={onDeleteEntry}
            onOpenLightbox={onOpenLightbox}
          />
        )}
      </div>
    </>
  );

  if (studyMode) {
    return (
      <div className="study-overlay">
        <div className="study-panel">{inner}</div>
      </div>
    );
  }

  return (
    <aside className="panel" style={{ width }}>
      <div
        className={`panel-resizer ${resizing ? 'active' : ''}`}
        onMouseDown={(e) => {
          e.preventDefault();
          setResizing(true);
        }}
      />
      {inner}
    </aside>
  );
}

function dedupeParts(parts: CountryPart[]): CountryPart[] {
  const seen = new Set<string>();
  return parts.filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true)));
}
