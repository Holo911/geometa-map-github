import { useRef, useState } from 'react';
import { api } from '../lib/api';
import type { Category } from '../lib/types';
import { categoryLabel, useT, type Lang } from '../i18n';

interface SettingsModalProps {
  lang: Lang;
  onChangeLang: (l: Lang) => void;
  uncoveredMode: 'dim' | 'hide';
  colorBySide: boolean;
  limitedAsUncovered: boolean;
  svOverlay: boolean;
  categories: Category[];
  onClose: () => void;
  onChangeUncoveredMode: (mode: 'dim' | 'hide') => void;
  onChangeColorBySide: (on: boolean) => void;
  onChangeLimitedAsUncovered: (on: boolean) => void;
  onChangeSvOverlay: (on: boolean) => void;
  onEnterCoverageEdit: () => void;
  onCategoriesChanged: () => void;
  onImported: (backupName: string) => void;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="toggle-knob" />
      <span className="toggle-label">{label}</span>
    </button>
  );
}

export default function SettingsModal({
  lang,
  onChangeLang,
  uncoveredMode,
  colorBySide,
  limitedAsUncovered,
  svOverlay,
  categories,
  onClose,
  onChangeUncoveredMode,
  onChangeColorBySide,
  onChangeLimitedAsUncovered,
  onChangeSvOverlay,
  onEnterCoverageEdit,
  onCategoriesChanged,
  onImported,
}: SettingsModalProps) {
  const t = useT();
  const [cats, setCats] = useState<Category[]>(() =>
    [...categories].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
  );
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [importState, setImportState] = useState<'idle' | 'confirm' | 'working'>('idle');
  const [status, setStatus] = useState<string | null>(null);
  const pendingImport = useRef<File | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const patchCat = async (id: number, patch: { name?: string; emoji?: string }) => {
    try {
      await api.updateCategory(id, patch);
      onCategoriesChanged();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= cats.length) return;
    const a = cats[index];
    const b = cats[j];
    const next = [...cats];
    next[index] = b;
    next[j] = a;
    setCats(next);
    try {
      await Promise.all([
        api.updateCategory(a.id, { sort: b.sort ?? j * 10 }),
        api.updateCategory(b.id, { sort: a.sort ?? index * 10 }),
      ]);
      // reflect swapped sort locally
      const sa = a.sort;
      a.sort = b.sort;
      b.sort = sa;
      onCategoriesChanged();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const addCategory = async () => {
    try {
      const c = await api.createCategory({ name: t('settings.newCategory'), emoji: '📌' });
      setCats((prev) => [...prev, c]);
      onCategoriesChanged();
    } catch (e) {
      setStatus((e as Error).message);
    }
  };

  const doDelete = async (id: number) => {
    try {
      const res = await api.deleteCategory(id);
      setCats((prev) => prev.filter((c) => c.id !== id));
      setConfirmDelete(null);
      if (res.movedCount > 0) setStatus(t.n('settings.movedToMisc', res.movedCount));
      onCategoriesChanged();
    } catch (e) {
      setStatus((e as Error).message);
      setConfirmDelete(null);
    }
  };

  const onPickImport = (file: File) => {
    pendingImport.current = file;
    setImportState('confirm');
  };

  const runImport = async () => {
    const file = pendingImport.current;
    if (!file) return;
    setImportState('working');
    setStatus(null);
    try {
      const res = await api.importBackup(file);
      onImported(res.backedUpTo);
    } catch (e) {
      setStatus(`Import failed: ${(e as Error).message}`);
      setImportState('idle');
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h3>{t('settings.title')}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Language — first, so a friend who opened the wrong language can fix it */}
          <section className="settings-section">
            <h4>{t('settings.language')}</h4>
            <div className="segmented">
              <button className={lang === 'en' ? 'active' : ''} onClick={() => onChangeLang('en')}>
                🌐 English
              </button>
              <button className={lang === 'ja' ? 'active' : ''} onClick={() => onChangeLang('ja')}>
                🌐 日本語
              </button>
            </div>
          </section>

          {/* Display */}
          <section className="settings-section">
            <h4>{t('settings.mapAppearance')}</h4>
            <Toggle on={colorBySide} onChange={onChangeColorBySide} label={t('settings.colorBySide')} />
            <p className="hint">{t('settings.colorBySideHint')}</p>
            <Toggle
              on={limitedAsUncovered}
              onChange={onChangeLimitedAsUncovered}
              label={t('settings.limitedAsUncovered')}
            />
            <p className="hint">{t('settings.limitedAsUncoveredHint')}</p>

            <label className="field-label" style={{ marginTop: 12 }}>
              {t('settings.uncoveredCountries')}
            </label>
            <div className="segmented">
              <button className={uncoveredMode === 'dim' ? 'active' : ''} onClick={() => onChangeUncoveredMode('dim')}>
                {t('settings.dim')}
              </button>
              <button className={uncoveredMode === 'hide' ? 'active' : ''} onClick={() => onChangeUncoveredMode('hide')}>
                {t('settings.hide')}
              </button>
            </div>
          </section>

          {/* Coverage editing */}
          <section className="settings-section">
            <h4>{t('settings.coverage')}</h4>
            <button className="btn" onClick={onEnterCoverageEdit}>
              {t('settings.editCoverage')}
            </button>
            <p className="hint">{t('settings.editCoverageHint')}</p>
          </section>

          {/* Experimental */}
          <section className="settings-section">
            <h4>{t('settings.experimental')}</h4>
            <Toggle
              on={svOverlay}
              onChange={onChangeSvOverlay}
              label={t('settings.svOverlay')}
            />
            <p className="hint">
              {t('settings.svOverlayHintA')}
              <strong>{t('settings.svOverlayHintBold')}</strong>
              {t('settings.svOverlayHintB')}
            </p>
          </section>

          {/* Category manager */}
          <section className="settings-section">
            <h4>{t('settings.categories')}</h4>
            <div className="cat-manager">
              {cats.map((c, i) => (
                <div className="cat-manage-row" key={c.id}>
                  <input
                    className="emoji-input"
                    defaultValue={c.emoji ?? ''}
                    maxLength={4}
                    onBlur={(e) => e.target.value !== (c.emoji ?? '') && patchCat(c.id, { emoji: e.target.value })}
                  />
                  {/*
                    Shows the TRANSLATED label for a still-default category, but
                    must never write it back: blurring an untouched field would
                    rename the DB row to Japanese and permanently turn a default
                    category into a "user-renamed" one. So a save only happens
                    when the text differs from BOTH the raw name and the label
                    we displayed. `key` includes the language so the
                    uncontrolled input re-initialises when it changes.
                  */}
                  <input
                    key={`${c.id}-${t.lang}`}
                    className="input"
                    defaultValue={categoryLabel(t.lang, c)}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (!v || v === c.name || v === categoryLabel(t.lang, c)) return;
                      patchCat(c.id, { name: v });
                    }}
                  />
                  <button className="icon-btn" title={t('settings.moveUp')} disabled={i === 0} onClick={() => move(i, -1)}>
                    ↑
                  </button>
                  <button className="icon-btn" title={t('settings.moveDown')} disabled={i === cats.length - 1} onClick={() => move(i, 1)}>
                    ↓
                  </button>
                  {confirmDelete === c.id ? (
                    <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => doDelete(c.id)}>
                      {t('common.confirm')}
                    </button>
                  ) : (
                    <button
                      className="icon-btn"
                      title={c.name === 'Misc' ? t('settings.miscCannotDelete') : t('settings.deleteCategory')}
                      disabled={c.name === 'Misc'}
                      onClick={() => setConfirmDelete(c.id)}
                    >
                      🗑
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn" style={{ marginTop: 8 }} onClick={addCategory}>
              {t('settings.addCategory')}
            </button>
          </section>

          {/* Backup */}
          <section className="settings-section">
            <h4>{t('settings.backup')}</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn" href={api.exportUrl}>
                {t('settings.export')}
              </a>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                {t('settings.import')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip"
                hidden
                onChange={(e) => {
                  if (e.target.files?.[0]) onPickImport(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <p className="hint">{t('settings.backupHint')}</p>
            {importState === 'confirm' && (
              <div className="confirm-row" style={{ color: 'var(--accent-warm)' }}>
                {t('settings.importConfirm', { name: pendingImport.current?.name ?? '' })}
                <button className="btn btn-danger" style={{ padding: '4px 10px' }} onClick={runImport}>
                  {t('settings.importReplace')}
                </button>
                <button className="btn" style={{ padding: '4px 10px' }} onClick={() => setImportState('idle')}>
                  {t('common.cancel')}
                </button>
              </div>
            )}
            {importState === 'working' && <p className="hint">{t('settings.importing')}</p>}
          </section>

          {status && <div className="settings-status">{status}</div>}
        </div>

        <div className="modal-footer">
          <span className="spacer" />
          <button className="btn btn-primary" onClick={onClose}>
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
