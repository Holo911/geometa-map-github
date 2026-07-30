import { useRef, useState } from 'react';
import type { CountryFacts, ScriptInfo, Tier } from '../lib/types';
import scriptsJson from '../data/scripts.json';
import { useT } from '../i18n';

const SCRIPTS = scriptsJson as unknown as Record<string, ScriptInfo>;

interface CountryIdCardProps {
  a3: string;
  facts?: CountryFacts;
  tier?: Tier;
  /** current alphabet image url, if the user has set one */
  alphabetUrl?: string;
  studyMode: boolean;
  onSetAlphabet: (file: File) => void;
  onRemoveAlphabet: () => void;
  onOpenImage: (url: string) => void;
}

/**
 * Facts arrive verbose ("Colombian peso (COP $)"). A tile shows the value at
 * ~23px, so keep the part that actually identifies the country — the code and
 * symbol — and drop the prose.
 */
function compactCurrency(raw: string): string {
  const m = raw.match(/\(([^)]+)\)/);
  return (m ? m[1] : raw).trim();
}

/** One fact tile: big value, tiny label underneath. */
function Tile({
  value,
  label,
  className = '',
  title,
}: {
  value: string;
  label: string;
  className?: string;
  title?: string;
}) {
  return (
    <div className={`id-tile ${className}`} title={title}>
      <div className="id-tile-value">{value}</div>
      <div className="id-tile-label">{label}</div>
    </div>
  );
}

export default function CountryIdCard({
  a3,
  facts,
  tier,
  alphabetUrl,
  studyMode,
  onSetAlphabet,
  onRemoveAlphabet,
  onOpenImage,
}: CountryIdCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const t = useT();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const script = SCRIPTS[a3];
  // script name + note come from scripts.json, which carries its own ja fields
  const scriptName = script && (t.lang === 'ja' ? script.script_ja ?? script.script : script.script);
  const scriptNote = script && (t.lang === 'ja' ? script.note_ja ?? script.note : script.note);

  const take = (files: FileList | null) => {
    const f = files && files[0];
    if (f && f.type.startsWith('image/')) onSetAlphabet(f);
  };

  // Clipboard paste works while the drop-zone has focus — same plumbing as the
  // note editor, so Snipping Tool → Ctrl+V lands an alphabet chart directly.
  const onPaste = (e: React.ClipboardEvent) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    const f = item.getAsFile();
    if (f) {
      e.preventDefault();
      onSetAlphabet(f);
    }
  };

  return (
    <section className={`id-card ${studyMode ? 'study' : ''}`}>
      <div className="id-grid">
        {facts?.tld && (
          <Tile value={facts.tld} label={t('idcard.domain')} className="accent" title={t('idcard.domainTitle')} />
        )}
        {facts?.phone && (
          <Tile value={facts.phone} label={t('idcard.phone')} className="accent" title={t('idcard.phoneTitle')} />
        )}
        {facts?.currency && (
          <Tile value={compactCurrency(facts.currency)} label={t('idcard.currency')} title={facts.currency} />
        )}
        {facts?.side && (
          <Tile
            value={facts.side === 'left' ? t('idcard.drivesLeft') : t('idcard.drivesRight')}
            label={t('idcard.drives')}
            className={`side-${facts.side}`}
            title={t('idcard.drivesTitle')}
          />
        )}
        {facts?.langs && facts.langs.length > 0 && (
          <Tile value={facts.langs.slice(0, 2).join(', ')} label={t('idcard.language')} className="wide" />
        )}
        {tier === 'limited' && (
          <Tile
            value={t('idcard.limited')}
            label={t('idcard.coverage')}
            className="limited"
            title={t('idcard.limitedTitle')}
          />
        )}
      </div>

      {/*
        Alphabet block. The built-in script sample and a user-uploaded chart are
        complementary, not alternatives: the sample is the quick "what does this
        writing look like" line, the chart is the real reference. So a country
        that has a sample ALWAYS shows it, with the user's image stacked below.
        Countries with no sample (plain-Latin) show the image alone, or the
        dashed drop-zone when the slot is still empty.
      */}
      <div className="id-alphabet">
        {script && (
          <div className="alpha-sample">
            <div className="alpha-sample-head">
              <span className="alpha-script">{scriptName}</span>
              {/* once a chart exists the figure carries Replace/Remove */}
              {!alphabetUrl && (
                <button className="alpha-btn ghost" onClick={() => fileRef.current?.click()}>
                  {t('alphabet.addChart')}
                </button>
              )}
            </div>
            <div className={`alpha-glyphs ${script.latin ? 'latin' : ''}`}>{script.sample}</div>
            {scriptNote && <div className="alpha-note">{scriptNote}</div>}
          </div>
        )}

        {alphabetUrl ? (
          <figure className={`alpha-figure ${script ? 'stacked' : ''}`}>
            <img
              src={alphabetUrl}
              alt={`${a3} alphabet`}
              onClick={() => onOpenImage(alphabetUrl)}
              title={t('alphabet.enlarge')}
            />
            <figcaption className="alpha-actions">
              <button className="alpha-btn" onClick={() => fileRef.current?.click()}>
                {t('common.replace')}
              </button>
              <button className="alpha-btn danger" onClick={onRemoveAlphabet}>
                {t('common.remove')}
              </button>
            </figcaption>
          </figure>
        ) : (
          !script && (
            <div
              className={`alpha-drop ${dragOver ? 'over' : ''}`}
              tabIndex={0}
              onPaste={onPaste}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                take(e.dataTransfer.files);
              }}
            >
              <span className="alpha-drop-icon">🔤</span>
              {t('alphabet.dropHint')}
            </div>
          )
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            take(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}
