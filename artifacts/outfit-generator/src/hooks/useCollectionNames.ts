/**
 * useCollectionNames
 *
 * Stores custom display names for the four collection rows in localStorage.
 * Defaults to "COLLECTION 1" – "COLLECTION 4".
 *
 * Consumers call setName(key, newName) to persist a rename.
 * The hook re-renders all consumers because it writes to a module-level
 * signal (a simple event emitter) so every open page stays in sync.
 */
import { useState, useEffect, useCallback } from "react";

export type RowKey = "outfits" | "beauty" | "toiletries" | "essentials";

export const ROW_KEYS: RowKey[] = ["outfits", "beauty", "toiletries", "essentials"];

const DEFAULTS: Record<RowKey, string> = {
  outfits:    "ROW 1",
  beauty:     "ROW 2",
  toiletries: "ROW 3",
  essentials: "ROW 4",
};

const STORAGE_KEY = "collection-names-v1";

// ── Module-level store so all hook instances share one source of truth ─────────

// Map any old default "COLLECTION N" names → new "ROW N" defaults
const LEGACY_MAP: Record<string, string> = {
  "COLLECTION 1": "ROW 1",
  "COLLECTION 2": "ROW 2",
  "COLLECTION 3": "ROW 3",
  "COLLECTION 4": "ROW 4",
};

function readStorage(): Record<RowKey, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Record<RowKey, string>>;
    const migrate = (v: string | undefined, def: string) =>
      LEGACY_MAP[v ?? ""] ?? v ?? def;
    return {
      outfits:    migrate(parsed.outfits,    DEFAULTS.outfits),
      beauty:     migrate(parsed.beauty,     DEFAULTS.beauty),
      toiletries: migrate(parsed.toiletries, DEFAULTS.toiletries),
      essentials: migrate(parsed.essentials, DEFAULTS.essentials),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeStorage(names: Record<RowKey, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {}
}

// Simple subscriber set so all hook instances re-render together
const listeners = new Set<() => void>();
let currentNames = readStorage();

function notifyAll() {
  listeners.forEach(fn => fn());
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCollectionNames() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const trigger = () => forceUpdate(n => n + 1);
    listeners.add(trigger);
    return () => { listeners.delete(trigger); };
  }, []);

  const setName = useCallback((key: RowKey, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return; // don't allow blank names
    currentNames = { ...currentNames, [key]: trimmed.toUpperCase() };
    writeStorage(currentNames);
    notifyAll();
  }, []);

  return { names: currentNames, setName };
}
