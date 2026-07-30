import { useEffect, useState } from 'react';
import type { RegionFC } from '../lib/types';

// Module-level cache so a country's admin-1 file is fetched at most once per session.
const cache = new Map<string, RegionFC | null>();
const inflight = new Map<string, Promise<RegionFC | null>>();

export function fetchAdmin1(a3: string): Promise<RegionFC | null> {
  if (cache.has(a3)) return Promise.resolve(cache.get(a3) ?? null);
  if (inflight.has(a3)) return inflight.get(a3)!;
  const p = fetch(`/geo/admin1/${a3}.geo.json`)
    .then((r) => (r.ok ? (r.json() as Promise<RegionFC>) : null))
    .then((fc) => {
      cache.set(a3, fc);
      inflight.delete(a3);
      return fc;
    })
    .catch(() => {
      cache.set(a3, null);
      inflight.delete(a3);
      return null;
    });
  inflight.set(a3, p);
  return p;
}

export function hasAdmin1Cached(a3: string): boolean {
  return cache.has(a3);
}

export function useAdmin1(a3: string | null): { regions: RegionFC | null; loading: boolean } {
  const [regions, setRegions] = useState<RegionFC | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!a3) {
      setRegions(null);
      setLoading(false);
      return;
    }
    if (cache.has(a3)) {
      setRegions(cache.get(a3) ?? null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setRegions(null);
    fetchAdmin1(a3).then((fc) => {
      if (!cancelled) {
        setRegions(fc);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [a3]);

  return { regions, loading };
}
