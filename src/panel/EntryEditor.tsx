import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { categoryLabel, useT } from '../i18n';
import type { Category, Entry, EntryImage, Scope, Tag } from '../lib/types';

export interface RegionOption {
  id: string;
  name: string;
}

interface EntryEditorProps {
  a3: string;
  categories: Category[];
  initialCategoryId: number;
  entry?: Entry | null;
  tags: Tag[];
  onTagsChanged: () => void;
  /** When provided, the region-scope UI is enabled (M4). */
  regionOptions?: RegionOption[];
  /** Controlled region selection (kept in App so map-picks + list stay in sync). */
  regionIds?: string[];
  onRegionIdsChange?: (ids: string[]) => void;
  /** IDs currently highlighted by "pick on map" mode; toggling handled by parent. */
  mapPickActive?: boolean;
  onToggleMapPick?: (active: boolean) => void;
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}

const OK_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const TAG_COLORS = [
  '#f5c518', '#e0533d', '#e07a3d', '#5ec26a', '#3dc9b0', '#3db0e0',
  '#4c7cff', '#9b5de5', '#e05da0', '#c98a6e', '#7a8b99', '#cbd3da',
];

interface Pending {
  key: string;
  file: File;
  url: string;
  caption: string;
}

export default function EntryEditor({
  a3,
  categories,
  initialCategoryId,
  entry,
  tags,
  onTagsChanged,
  regionOptions,
  regionIds: regionIdsProp,
  onRegionIdsChange,
  mapPickActive,
  onToggleMapPick,
  onClose,
  onSaved,
}: EntryEditorProps) {
  const t = useT();
  const editing = !!entry;
  const regionsEnabled = !!regionOptions;

  const [categoryId, setCategoryId] = useState(entry?.category_id ?? initialCategoryId);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [bodyMd, setBodyMd] = useState(entry?.body_md ?? '');
  const [scope, setScope] = useState<Scope>(entry?.scope ?? 'country');
  const [tagIds, setTagIds] = useState<number[]>(entry?.tag_ids ?? []);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  // Region selection is controlled by the parent when onRegionIdsChange is given
  // (so picking on the map and in the list share one source of truth).
  const [regionIdsInternal, setRegionIdsInternal] = useState<string[]>(entry?.region_ids ?? []);
  const regionIds = onRegionIdsChange ? regionIdsProp ?? [] : regionIdsInternal;
  const setRegionIds = useCallback(
    (next: string[]) => {
      if (onRegionIdsChange) onRegionIdsChange(next);
      else setRegionIdsInternal(next);
    },
    [onRegionIdsChange]
  );

  const [existing, setExisting] = useState<Array<EntryImage & { toDelete?: boolean }>>(
    entry?.images ?? []
  );
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [regionQuery, setRegionQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<Pending[]>([]);
  pendingRef.current = pending;

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => pendingRef.current.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  const dirty = useMemo(() => {
    if (pending.length > 0) return true;
    if (existing.some((im) => im.toDelete)) return true;
    if (!editing) return title !== '' || bodyMd !== '' || regionIds.length > 0 || tagIds.length > 0;
    return (
      categoryId !== entry!.category_id ||
      title !== entry!.title ||
      bodyMd !== entry!.body_md ||
      scope !== entry!.scope ||
      regionIds.slice().sort().join() !== entry!.region_ids.slice().sort().join() ||
      tagIds.slice().sort().join() !== entry!.tag_ids.slice().sort().join() ||
      existing.some((im) => {
        const orig = entry!.images.find((o) => o.id === im.id);
        return orig && orig.caption !== im.caption;
      })
    );
  }, [pending, existing, editing, title, bodyMd, categoryId, scope, regionIds, tagIds, entry]);

  const toggleTag = (id: number) =>
    setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const [creatingTag, setCreatingTag] = useState(false);
  const createNewTag = async () => {
    const name = newTagName.trim();
    if (!name || creatingTag) return;
    setCreatingTag(true);
    try {
      const tag = await api.createTag({ name, color: newTagColor });
      setTagIds((prev) => [...prev, tag.id]);
      setNewTagName('');
      onTagsChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingTag(false);
    }
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const accepted = Array.from(files).filter((f) => OK_TYPES.has(f.type));
    if (accepted.length === 0) return;
    setPending((prev) => [
      ...prev,
      ...accepted.map((file) => ({
        key: crypto.randomUUID(),
        file,
        url: URL.createObjectURL(file),
        caption: '',
      })),
    ]);
  }, []);

  const onPaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length && Array.from(files).some((f) => OK_TYPES.has(f.type))) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const removePending = (key: string) => {
    setPending((prev) => {
      const p = prev.find((x) => x.key === key);
      if (p) URL.revokeObjectURL(p.url);
      return prev.filter((x) => x.key !== key);
    });
  };

  const toggleRegion = useCallback(
    (id: string) => {
      setRegionIds(regionIds.includes(id) ? regionIds.filter((r) => r !== id) : [...regionIds, id]);
    },
    [regionIds, setRegionIds]
  );

  const attemptClose = () => {
    if (mapPickActive) {
      onToggleMapPick?.(false); // Esc/backdrop first exits pick mode
      return;
    }
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const effectiveScope: Scope = regionsEnabled && scope === 'regions' ? 'regions' : 'country';
      const payload: Partial<Entry> = {
        a3,
        category_id: categoryId,
        title: title.trim(),
        body_md: bodyMd,
        scope: effectiveScope,
        region_ids: effectiveScope === 'regions' ? regionIds : [],
        tag_ids: tagIds,
      };

      let saved: Entry = editing
        ? await api.updateEntry(entry!.id, payload)
        : await api.createEntry(payload);

      // delete flagged existing images
      const toDelete = existing.filter((im) => im.toDelete);
      for (const im of toDelete) await api.deleteImage(im.id);

      // patch changed captions on surviving existing images
      for (const im of existing) {
        if (im.toDelete) continue;
        const orig = entry?.images.find((o) => o.id === im.id);
        if (orig && orig.caption !== im.caption) {
          await api.updateImage(im.id, { caption: im.caption });
        }
      }

      // upload new files, then caption them (matched by sort order)
      if (pending.length) {
        const beforeIds = new Set(saved.images.map((i) => i.id));
        saved = await api.uploadImages(saved.id, pending.map((p) => p.file));
        const newOnes = saved.images
          .filter((i) => !beforeIds.has(i.id))
          .sort((x, y) => x.sort - y.sort);
        for (let i = 0; i < newOnes.length && i < pending.length; i++) {
          const cap = pending[i].caption.trim();
          if (cap) await api.updateImage(newOnes[i].id, { caption: cap });
        }
      }

      // final refetch to reflect caption/delete edits
      const list = await api.getEntries(a3);
      const finalEntry = list.find((e) => e.id === saved.id) ?? saved;

      pending.forEach((p) => URL.revokeObjectURL(p.url));
      onSaved(finalEntry);
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  // Window-level key handling so Esc / Ctrl+Enter work regardless of focus.
  const saveRef = useRef(save);
  saveRef.current = save;
  const closeRef = useRef(attemptClose);
  closeRef.current = attemptClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveRef.current();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const filteredRegions = useMemo(() => {
    if (!regionOptions) return [];
    const q = regionQuery.trim().toLowerCase();
    const list = q ? regionOptions.filter((r) => r.name.toLowerCase().includes(q)) : regionOptions;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [regionOptions, regionQuery]);

  const regionName = (id: string) => regionOptions?.find((r) => r.id === id)?.name ?? id;


  return (
    <div
      className={`modal-overlay ${mapPickActive ? 'pick-through' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && attemptClose()}
    >
      <div className="modal" onPaste={onPaste}>
        {mapPickActive && (
          <div className="pick-banner">
            {t('editor.pickBanner')}
            <button className="btn btn-primary" onClick={() => onToggleMapPick?.(false)}>
              {t('editor.donePicking')}
            </button>
          </div>
        )}
        <div className="modal-header">
          <h3>{editing ? t('editor.editNote') : t('editor.newNote')}</h3>
          <button className="icon-btn" onClick={attemptClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div>
            <label className="field-label">{t('editor.category')}</label>
            <select
              className="select"
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji ? `${c.emoji} ` : ''}
                  {categoryLabel(t.lang, c)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">{t('editor.titleField')}</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('editor.titlePlaceholder')}
              autoFocus
            />
          </div>

          <div>
            <label className="field-label">{t('editor.bodyField')}</label>
            <textarea
              className="textarea"
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              placeholder={t('editor.bodyPlaceholder')}
            />
          </div>

          <div>
            <label className="field-label">{t('editor.tags')}</label>
            <div className="tag-picker">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`tag-opt ${tagIds.includes(tag.id) ? 'on' : ''}`}
                  style={tagIds.includes(tag.id) ? { background: tag.color, borderColor: tag.color, color: '#06131c' } : { borderColor: tag.color }}
                  onClick={() => toggleTag(tag.id)}
                >
                  <span className="tag-dot" style={{ background: tag.color }} />
                  {tag.name}
                </button>
              ))}
            </div>
            <div className="tag-create">
              <input
                className="input"
                placeholder={t('editor.newTagPlaceholder')}
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    createNewTag();
                  }
                }}
              />
              <div className="swatches">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch ${newTagColor === c ? 'sel' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewTagColor(c)}
                    aria-label={c}
                  />
                ))}
              </div>
              <button type="button" className="btn" disabled={!newTagName.trim() || creatingTag} onClick={createNewTag}>
                {t('editor.createTag')}
              </button>
            </div>
          </div>

          {regionsEnabled && (
            <div>
              <label className="field-label">{t('editor.appliesTo')}</label>
              <div className="segmented">
                <button
                  className={scope === 'country' ? 'active' : ''}
                  onClick={() => setScope('country')}
                  type="button"
                >
                  {t('editor.wholeCountry')}
                </button>
                <button
                  className={scope === 'regions' ? 'active' : ''}
                  onClick={() => setScope('regions')}
                  type="button"
                >
                  {t('editor.specificRegions')}
                </button>
              </div>

              {scope === 'regions' && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input
                      className="input"
                      placeholder={t('editor.searchRegions')}
                      value={regionQuery}
                      onChange={(e) => setRegionQuery(e.target.value)}
                    />
                    <button
                      type="button"
                      className={`btn ${mapPickActive ? 'btn-primary' : ''}`}
                      onClick={() => onToggleMapPick?.(!mapPickActive)}
                    >
                      {mapPickActive ? t('editor.picking') : t('editor.pickOnMap')}
                    </button>
                  </div>

                  {regionIds.length > 0 && (
                    <div className="chips" style={{ marginBottom: 8 }}>
                      {regionIds.map((id) => (
                        <span key={id} className="chip">
                          {regionName(id)}
                          <span className="x" onClick={() => toggleRegion(id)}>
                            ✕
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      maxHeight: 160,
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: 7,
                    }}
                  >
                    {filteredRegions.map((r) => (
                      <label
                        key={r.id}
                        style={{
                          display: 'flex',
                          gap: 8,
                          padding: '6px 10px',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={regionIds.includes(r.id)}
                          onChange={() => toggleRegion(r.id)}
                        />
                        {r.name}
                      </label>
                    ))}
                    {filteredRegions.length === 0 && (
                      <div className="hint" style={{ padding: '8px 10px' }}>
                        {t('editor.noRegions')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="field-label">{t('editor.screenshots')}</label>
            <div
              className={`dropzone ${dragging ? 'drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
              }}
            >
              {t('editor.dropzone')}
              <button
                type="button"
                className="btn-ghost"
                style={{ display: 'inline', padding: 0, color: 'var(--accent)' }}
                onClick={() => fileInputRef.current?.click()}
              >
                {t('editor.browse')}
              </button>
              {t('editor.dropzoneEnd')}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>

            {(existing.some((im) => !im.toDelete) || pending.length > 0) && (
              <div className="thumbs" style={{ marginTop: 10 }}>
                {existing
                  .filter((im) => !im.toDelete)
                  .map((im) => (
                    <div className="editor-thumb" key={`ex-${im.id}`}>
                      <div className="img-wrap">
                        <img src={im.url} alt={im.caption} />
                        <button
                          type="button"
                          className="rm"
                          title={t('common.remove')}
                          onClick={() =>
                            setExisting((prev) =>
                              prev.map((x) => (x.id === im.id ? { ...x, toDelete: true } : x))
                            )
                          }
                        >
                          ✕
                        </button>
                      </div>
                      <input
                        className="cap"
                        placeholder={t('editor.captionPlaceholder')}
                        value={im.caption}
                        onChange={(e) =>
                          setExisting((prev) =>
                            prev.map((x) =>
                              x.id === im.id ? { ...x, caption: e.target.value } : x
                            )
                          )
                        }
                      />
                    </div>
                  ))}
                {pending.map((p) => (
                  <div className="editor-thumb" key={p.key}>
                    <div className="img-wrap">
                      <img src={p.url} alt="" />
                      <button
                        type="button"
                        className="rm"
                        title={t('common.remove')}
                        onClick={() => removePending(p.key)}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      className="cap"
                      placeholder={t('editor.captionPlaceholder')}
                      value={p.caption}
                      onChange={(e) =>
                        setPending((prev) =>
                          prev.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x))
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <div className="confirm-row">⚠ {error}</div>}
        </div>

        <div className="modal-footer">
          {confirmClose ? (
            <>
              <span className="hint" style={{ marginRight: 'auto' }}>
                {t('editor.unsaved')}
              </span>
              <button className="btn" onClick={() => setConfirmClose(false)}>
                {t('editor.keepEditing')}
              </button>
              <button className="btn btn-danger" onClick={onClose}>
                {t('editor.discard')}
              </button>
            </>
          ) : (
            <>
              <span className="hint" style={{ marginRight: 'auto' }}>
                {t('editor.ctrlEnter')}
              </span>
              <button className="btn" onClick={attemptClose} disabled={saving}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? t('editor.saving') : editing ? t('editor.save') : t('editor.addNote')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
