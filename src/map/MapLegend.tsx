import { useState } from 'react';
import { LHT, MAP, RHT, UNIFORM } from './palette';
import { useT } from '../i18n';

interface MapLegendProps {
  colorBySide: boolean;
  showLimited: boolean;
  /** category rail is open — shift right so they don't overlap */
  railOpen?: boolean;
}

// Every swatch reads the same tokens the map paints with, so the legend cannot
// drift from reality.
function Swatch({ color, border, dashed, ring }: { color: string; border?: string; dashed?: boolean; ring?: boolean }) {
  return (
    <span
      className="legend-swatch"
      style={{
        background: color,
        border: ring
          ? `2px solid ${MAP.notesOutline}`
          : dashed
            ? `1.5px dashed ${border}`
            : `1px solid ${border ?? 'transparent'}`,
      }}
    />
  );
}

export default function MapLegend({ colorBySide, showLimited, railOpen }: MapLegendProps) {
  const t = useT();
  const [open, setOpen] = useState(() => localStorage.getItem('legendOpen') !== 'false');

  const toggle = () => {
    setOpen((o) => {
      localStorage.setItem('legendOpen', String(!o));
      return !o;
    });
  };

  return (
    <div className={`map-legend${railOpen ? ' rail-open' : ''}`}>
      <button className="legend-head" onClick={toggle}>
        <span>{t('legend.title')}</span>
        <span className="legend-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="legend-body">
          {colorBySide ? (
            <>
              <div className="legend-row">
                <Swatch color={RHT.full} border={RHT.border} /> {t('legend.drivesRight')}
              </div>
              <div className="legend-row">
                <Swatch color={LHT.full} border={LHT.border} /> {t('legend.drivesLeft')}
              </div>
            </>
          ) : (
            <div className="legend-row">
              <Swatch color={UNIFORM.full} border={UNIFORM.border} /> {t('legend.covered')}
            </div>
          )}
          {showLimited && (
            <div className="legend-row">
              <Swatch color={colorBySide ? RHT.limited : UNIFORM.limited} border={RHT.limitedLine} dashed />{' '}
              {t('legend.limited')}
            </div>
          )}
          <div className="legend-row">
            <Swatch color={colorBySide ? RHT.notes : UNIFORM.notes} ring /> {t('legend.hasNotes')}
          </div>
          <div className="legend-row">
            <Swatch color={MAP.uncovered} border={MAP.uncoveredBorder} /> {t('legend.noCoverage')}
          </div>
          <div className="legend-row legend-road">
            <span className="legend-swatch legend-swatch-line" style={{ background: MAP.road }} />{' '}
            {t('legend.roads')}
          </div>
        </div>
      )}
    </div>
  );
}
