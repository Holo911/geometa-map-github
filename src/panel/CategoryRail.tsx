import { Fragment } from 'react';
import type { Category, Tag } from '../lib/types';
import { categoryLabel, useT } from '../i18n';
import TagSwatch from './TagSwatch';

export type RailSelection = { type: 'category' | 'tag'; id: number } | null;

/** A country carrying the active category/tag. */
export interface RailCountry {
  a3: string;
  name: string;
}

interface CategoryRailProps {
  categories: Category[];
  tags: Tag[];
  categoryCounts: Record<number, number>;
  tagCountryCounts: Record<number, number>;
  selection: RailSelection;
  onSelect: (sel: RailSelection) => void;
  /** Countries matching `selection`, already sorted and named for the UI. */
  countries: RailCountry[];
  selectedA3: string | null;
  onSelectCountry: (a3: string) => void;
}

export default function CategoryRail({
  categories,
  tags,
  categoryCounts,
  tagCountryCounts,
  selection,
  onSelect,
  countries,
  selectedA3,
  onSelectCountry,
}: CategoryRailProps) {
  const t = useT();
  const isActive = (type: 'category' | 'tag', id: number) =>
    selection?.type === type && selection.id === id;

  const toggle = (sel: NonNullable<RailSelection>) =>
    onSelect(isActive(sel.type, sel.id) ? null : sel);

  // The map spotlight answers "roughly where?" — this answers "which ones,
  // exactly?", which is the question you actually have when you're checking
  // whether a country slipped through.
  const countryList = (
    <div className="rail-countries">
      {countries.map((c) => (
        <button
          key={c.a3}
          className={`rail-country${selectedA3 === c.a3 ? ' active' : ''}`}
          onClick={() => onSelectCountry(c.a3)}
        >
          {c.name}
        </button>
      ))}
    </div>
  );

  return (
    <aside className="cat-rail">
      <div className="rail-head">{t('rail.browseByCategory')}</div>
      <div className="rail-scroll">
        <div className="rail-group">
          {categories.map((c) => {
            const n = categoryCounts[c.id] ?? 0;
            const active = isActive('category', c.id);
            return (
              <Fragment key={c.id}>
                <button
                  className={`rail-row ${active ? 'active' : ''} ${n === 0 ? 'empty' : ''}`}
                  onClick={() => toggle({ type: 'category', id: c.id })}
                >
                  <span className="rail-emoji">{c.emoji || '•'}</span>
                  <span className="rail-name">{categoryLabel(t.lang, c)}</span>
                  <span className="rail-count">{n}</span>
                </button>
                {active && countryList}
              </Fragment>
            );
          })}
        </div>

        <div className="rail-group-label">{t('rail.tags')}</div>
        <div className="rail-group">
          {tags.length === 0 && <div className="rail-empty-hint">{t('rail.noTags')}</div>}
          {tags.map((tag) => {
            const n = tagCountryCounts[tag.id] ?? 0;
            const active = isActive('tag', tag.id);
            return (
              <Fragment key={tag.id}>
                <button
                  className={`rail-row ${active ? 'active' : ''}`}
                  onClick={() => toggle({ type: 'tag', id: tag.id })}
                >
                  <TagSwatch tag={tag} shape="square" />
                  <span className="rail-name">{tag.name}</span>
                  <span className="rail-count">{n}</span>
                </button>
                {active && countryList}
              </Fragment>
            );
          })}
        </div>
      </div>
      {selection && (
        <button className="rail-clear" onClick={() => onSelect(null)}>
          {t('rail.clear')}
        </button>
      )}
    </aside>
  );
}
