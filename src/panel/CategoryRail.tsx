import type { Category, Tag } from '../lib/types';
import { categoryLabel, useT } from '../i18n';

export type RailSelection = { type: 'category' | 'tag'; id: number } | null;

interface CategoryRailProps {
  categories: Category[];
  tags: Tag[];
  categoryCounts: Record<number, number>;
  tagCountryCounts: Record<number, number>;
  selection: RailSelection;
  onSelect: (sel: RailSelection) => void;
}

export default function CategoryRail({
  categories,
  tags,
  categoryCounts,
  tagCountryCounts,
  selection,
  onSelect,
}: CategoryRailProps) {
  const t = useT();
  const isActive = (type: 'category' | 'tag', id: number) =>
    selection?.type === type && selection.id === id;

  const toggle = (sel: NonNullable<RailSelection>) =>
    onSelect(isActive(sel.type, sel.id) ? null : sel);

  return (
    <aside className="cat-rail">
      <div className="rail-head">{t('rail.browseByCategory')}</div>
      <div className="rail-scroll">
        <div className="rail-group">
          {categories.map((c) => {
            const n = categoryCounts[c.id] ?? 0;
            return (
              <button
                key={c.id}
                className={`rail-row ${isActive('category', c.id) ? 'active' : ''} ${n === 0 ? 'empty' : ''}`}
                onClick={() => toggle({ type: 'category', id: c.id })}
              >
                <span className="rail-emoji">{c.emoji || '•'}</span>
                <span className="rail-name">{categoryLabel(t.lang, c)}</span>
                <span className="rail-count">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="rail-group-label">{t('rail.tags')}</div>
        <div className="rail-group">
          {tags.length === 0 && <div className="rail-empty-hint">{t('rail.noTags')}</div>}
          {tags.map((tag) => {
            const n = tagCountryCounts[tag.id] ?? 0;
            return (
              <button
                key={tag.id}
                className={`rail-row ${isActive('tag', tag.id) ? 'active' : ''}`}
                onClick={() => toggle({ type: 'tag', id: tag.id })}
              >
                <span className="rail-swatch" style={{ background: tag.color }} />
                <span className="rail-name">{tag.name}</span>
                <span className="rail-count">{n}</span>
              </button>
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
