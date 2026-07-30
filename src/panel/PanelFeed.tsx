import { useMemo } from 'react';
import type { Category, Entry, EntryImage, Tag } from '../lib/types';
import EntryCard from './EntryCard';
import { categoryLabel, useT } from '../i18n';

interface PanelFeedProps {
  categories: Category[];
  entries: Entry[];
  tags?: Tag[];
  regionFilter?: string | null;
  categoryFilter?: number | null;
  regionNameOf?: (id: string) => string;
  onAddNote: (categoryId: number) => void;
  onEditEntry: (entry: Entry) => void;
  onDeleteEntry: (entry: Entry) => void;
  onOpenLightbox: (images: EntryImage[], index: number) => void;
}

export default function PanelFeed({
  categories,
  entries,
  tags,
  regionFilter,
  categoryFilter,
  regionNameOf,
  onAddNote,
  onEditEntry,
  onDeleteEntry,
  onOpenLightbox,
}: PanelFeedProps) {
  const t = useT();
  const tagById = useMemo(() => {
    const m = new Map<number, Tag>();
    for (const t of tags ?? []) m.set(t.id, t);
    return m;
  }, [tags]);

  const shown = useMemo(() => {
    let list = entries;
    if (regionFilter) list = list.filter((e) => e.scope === 'regions' && e.region_ids.includes(regionFilter));
    if (categoryFilter != null) list = list.filter((e) => e.category_id === categoryFilter);
    return list;
  }, [entries, regionFilter, categoryFilter]);

  const byCategory = useMemo(() => {
    const m = new Map<number, Entry[]>();
    for (const e of shown) {
      if (!m.has(e.category_id)) m.set(e.category_id, []);
      m.get(e.category_id)!.push(e);
    }
    return m;
  }, [shown]);

  const filtering = !!regionFilter || categoryFilter != null;
  const withEntries = categories.filter((c) => (byCategory.get(c.id)?.length ?? 0) > 0);
  const empty = filtering ? [] : categories.filter((c) => (byCategory.get(c.id)?.length ?? 0) === 0);

  const jumpTo = (id: number) => {
    document.getElementById(`feed-cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="feed">
      {withEntries.length > 1 && (
        <div className="feed-nav">
          {withEntries.map((c) => (
            <button key={c.id} className="feed-nav-chip" onClick={() => jumpTo(c.id)} title={categoryLabel(t.lang, c)}>
              <span className="nav-emoji">{c.emoji || '•'}</span>
              <span className="nav-count">{byCategory.get(c.id)!.length}</span>
            </button>
          ))}
        </div>
      )}

      {withEntries.map((c) => (
        <section className="feed-section" id={`feed-cat-${c.id}`} key={c.id}>
          <div className="feed-section-head">
            <span className="cat-emoji">{c.emoji || '•'}</span>
            <span className="cat-name">{categoryLabel(t.lang, c)}</span>
            <span className="cat-count">{byCategory.get(c.id)!.length}</span>
            <button className="icon-btn add" title={t('feed.addToCategory', { name: categoryLabel(t.lang, c) })} onClick={() => onAddNote(c.id)}>
              +
            </button>
          </div>
          {byCategory.get(c.id)!.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              entryTags={entry.tag_ids.map((id) => tagById.get(id)).filter((x): x is Tag => !!x)}
              regionNameOf={regionNameOf}
              onEdit={() => onEditEntry(entry)}
              onDelete={() => onDeleteEntry(entry)}
              onOpenLightbox={onOpenLightbox}
            />
          ))}
        </section>
      ))}

      {empty.length > 0 && (
        <div className="feed-add-cluster">
          <div className="cluster-label">
            {withEntries.length === 0 ? t('feed.addFirstNote') : t('feed.addNote')}
          </div>
          <div className="cluster-chips">
            {empty.map((c) => (
              <button key={c.id} className="add-cat-chip" onClick={() => onAddNote(c.id)}>
                {c.emoji || '•'} {categoryLabel(t.lang, c)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
