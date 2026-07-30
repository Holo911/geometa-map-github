import { useEffect, useMemo, useRef, useState } from 'react';
import type { CountryProps, Tier } from '../lib/types';
import { flagEmoji } from '../lib/flags';
import { countryName, countryNameJa } from '../lib/countryName';
import { useT } from '../i18n';

interface CountrySearchProps {
  countries: CountryProps[];
  coverage: Map<string, Tier>;
  entryCounts: Record<string, number>;
  onSelect: (a3: string) => void;
  onClose: () => void;
}

const isCov = (t: Tier | undefined) => t === 'full' || t === 'limited';

function score(name: string, q: string): number | null {
  if (!q) return 0;
  const n = name.toLowerCase();
  const idx = n.indexOf(q);
  if (idx === 0) return 100;
  if (idx > 0) return 60 - Math.min(idx, 40);
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) if (n[i] === q[qi]) qi++;
  return qi === q.length ? 15 : null;
}

export default function CountrySearch({
  countries,
  coverage,
  entryCounts,
  onSelect,
  onClose,
}: CountrySearchProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { covered, uncovered } = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Match on the English AND Japanese name, so "japan" and "日本" both work
    // whichever language the UI is in.
    const scored = countries
      .map((c) => {
        const ja = countryNameJa(c.a3);
        const s = Math.max(score(c.name, q) ?? -1, ja ? score(ja, q) ?? -1 : -1);
        return { c, s: s < 0 ? null : s };
      })
      .filter((x): x is { c: CountryProps; s: number } => x.s !== null);
    const cov = scored
      .filter((x) => isCov(coverage.get(x.c.a3)))
      .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
      .slice(0, 40)
      .map((x) => x.c);
    const unc = scored
      .filter((x) => !isCov(coverage.get(x.c.a3)))
      .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
      .slice(0, 8)
      .map((x) => x.c);
    return { covered: cov, uncovered: unc };
  }, [countries, coverage, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const choose = (a3: string) => {
    onSelect(a3);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(covered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (covered[active]) choose(covered[active].a3);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector('.search-row.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search-palette" onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="search-input"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="search-list" ref={listRef}>
          {covered.length === 0 && uncovered.length === 0 && (
            <div className="search-empty">{t('search.noResults', { q: query })}</div>
          )}
          {covered.map((c, i) => {
            const n = entryCounts[c.a3] || 0;
            const flag = flagEmoji(c.a2);
            return (
              <div
                key={c.a3}
                className={`search-row ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(c.a3)}
              >
                <span className="search-flag">{flag || '🏳'}</span>
                <span className="search-name">{countryName(c.a3, c.name, t.lang)}</span>
                {n > 0 && <span className="search-count">{n}</span>}
              </div>
            );
          })}
          {uncovered.length > 0 && (
            <>
              <div className="search-section">{t('search.notCovered')}</div>
              {uncovered.map((c) => (
                <div key={c.a3} className="search-row uncovered" title={t('search.noCoverageTitle')}>
                  <span className="search-flag">{flagEmoji(c.a2) || '🏳'}</span>
                  <span className="search-name">{countryName(c.a3, c.name, t.lang)}</span>
                  <span className="search-tag">{t('search.uncoveredTag')}</span>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="search-foot">
          <span>{t('search.hint')}</span>
        </div>
      </div>
    </div>
  );
}
