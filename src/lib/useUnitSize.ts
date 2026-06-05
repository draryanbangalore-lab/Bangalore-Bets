'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'cappertrack_unit_size';
const DEFAULT     = 25;

/**
 * Persists the user's $/unit size in localStorage so it's shared across
 * the Analyze, My Active Bets, and Historical Data pages.
 */
export function useUnitSize(): [number, (n: number) => void] {
  const [unitSize, set] = useState<number>(DEFAULT);

  // Hydrate after mount to avoid SSR mismatch
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const n = parseFloat(stored);
      if (!isNaN(n) && n >= 1) set(n);
    }
  }, []);

  function setUnitSize(n: number) {
    const v = Math.max(1, Math.round(n));
    set(v);
    localStorage.setItem(STORAGE_KEY, String(v));
  }

  return [unitSize, setUnitSize];
}
