/**
 * useBestTimes — localStorage-backed best completion times per maze size.
 *
 * Key format: "mazeracer_best_<size>"  (e.g. "mazeracer_best_21")
 * Value: fastest time in seconds (float), serialised as a string.
 */
import { useCallback } from "react";

const NS = "mazeracer_best_";

/** Read the stored best time for a given maze size. Returns null if none. */
export function readBest(size: number): number | null {
  try {
    const raw = localStorage.getItem(`${NS}${size}`);
    if (raw === null) return null;
    const v = parseFloat(raw);
    return isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** Write a new best time for a maze size (only if it's actually better). */
export function writeBest(size: number, time: number): void {
  try {
    const prev = readBest(size);
    if (prev === null || time < prev) {
      localStorage.setItem(`${NS}${size}`, time.toString());
    }
  } catch {
    // storage unavailable — ignore
  }
}

/**
 * Hook that returns helpers for reading/writing best times.
 * Stable references — safe to use in callbacks without re-renders.
 */
export function useBestTimes() {
  const getBest = useCallback((size: number) => readBest(size), []);
  const trySetBest = useCallback(
    (size: number, time: number): boolean => {
      const prev = readBest(size);
      const isNew = prev === null || time < prev;
      if (isNew) writeBest(size, time);
      return isNew;
    },
    []
  );
  return { getBest, trySetBest };
}
