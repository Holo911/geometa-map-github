import type { CountryPart } from '../lib/types';
import { useT } from '../i18n';
import type { BBox } from '../lib/parts';

interface OffscreenCueProps {
  parts: CountryPart[];
  onZoom: (box: BBox) => void;
}

export default function OffscreenCue({ parts, onZoom }: OffscreenCueProps) {
  const t = useT();
  // de-duplicate by label (e.g. Alaska can be several polygons)
  const seen = new Set<string>();
  const uniq = parts.filter((p) => (seen.has(p.label) ? false : (seen.add(p.label), true)));
  const shown = uniq.slice(0, 6);

  return (
    <div className="offscreen-cue">
      <span className="cue-icon">🏝</span>
      <span className="cue-count">{t.n('cue.count', uniq.length)}</span>
      <div className="cue-list">
        {shown.map((p) => (
          <button key={p.label} className="cue-item" onClick={() => onZoom(p.bbox as BBox)}>
            {p.label}
          </button>
        ))}
        {uniq.length > shown.length && <span className="cue-more">+{uniq.length - shown.length}</span>}
      </div>
    </div>
  );
}
