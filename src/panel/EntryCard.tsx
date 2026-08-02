import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Entry, EntryImage, Tag } from '../lib/types';
import { renderMarkdown } from '../lib/markdown';
import { useT } from '../i18n';
import TagSwatch from './TagSwatch';

interface EntryCardProps {
  entry: Entry;
  entryTags?: Tag[];
  regionNameOf?: (id: string) => string;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLightbox: (images: EntryImage[], index: number) => void;
}

export default function EntryCard({
  entry,
  entryTags,
  regionNameOf,
  onEdit,
  onDelete,
  onOpenLightbox,
}: EntryCardProps) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const html = useMemo(() => renderMarkdown(entry.body_md), [entry.body_md]);
  const hasBody = entry.body_md.trim().length > 0;
  const hasImages = entry.images.length > 0;

  // Body collapses to ~2 lines behind a "more" toggle — but only when there is an
  // image (image-first). No image ⇒ text is the content, so it's expanded.
  const [expanded, setExpanded] = useState(!hasImages);
  const [clamped, setClamped] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    setClamped(el.scrollHeight - el.clientHeight > 4);
  }, [html, expanded]);

  useEffect(() => {
    setExpanded(!hasImages);
  }, [hasImages, entry.id]);

  return (
    <div className="entry-card">
      <div className="entry-card-head">
        <h4 className={`entry-title ${entry.title ? '' : 'untitled'}`}>
          {entry.title || t('feed.untitled')}
        </h4>
        <div className="entry-actions">
          <button className="icon-btn" title={t('common.edit')} onClick={onEdit}>
            ✎
          </button>
          <button className="icon-btn" title={t('common.delete')} onClick={() => setConfirming(true)}>
            🗑
          </button>
        </div>
      </div>

      {hasImages && (
        <div className="entry-images">
          {entry.images.map((im, i) => (
            <figure className="entry-image" key={im.id}>
              <img
                src={im.url}
                alt={im.caption}
                loading="lazy"
                onClick={() => onOpenLightbox(entry.images, i)}
                title={t('common.open')}
              />
              {im.caption && <figcaption>{im.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {hasBody && (
        <>
          <div
            ref={bodyRef}
            className={`entry-md ${expanded ? '' : 'clamp'}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {(clamped || (expanded && hasImages)) && (
            <button className="more-toggle" onClick={() => setExpanded((e) => !e)}>
              {expanded ? t('feed.less') : t('feed.more')}
            </button>
          )}
        </>
      )}

      {((entry.scope === 'regions' && entry.region_ids.length > 0) || (entryTags && entryTags.length > 0)) && (
        <div className="chips">
          {entry.scope === 'regions' &&
            entry.region_ids.map((id) => (
              <span className="chip" key={`r${id}`}>
                📍 {regionNameOf ? regionNameOf(id) : id}
              </span>
            ))}
          {entryTags?.map((tag) => (
            <span
              className="chip tag-chip"
              key={`t${tag.id}`}
              style={{ borderColor: tag.color, color: tag.color }}
            >
              <TagSwatch tag={tag} />
              {tag.name}
            </span>
          ))}
        </div>
      )}

      {confirming && (
        <div className="confirm-row">
          {t('feed.deleteConfirm')}
          <button className="btn btn-danger" style={{ padding: '3px 10px' }} onClick={onDelete}>
            {t('common.delete')}
          </button>
          <button className="btn" style={{ padding: '3px 10px' }} onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
