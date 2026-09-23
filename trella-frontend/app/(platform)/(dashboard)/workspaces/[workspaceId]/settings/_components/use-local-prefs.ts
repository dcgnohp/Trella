"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * localStorage-backed preference object with a stable default.
 *
 * ponytail: no backend exists for personal preferences, so they live in
 * localStorage keyed per workspace. Upgrade path: swap `read`/`write` for a
 * `UserPreferencesService` call when the API lands — the component API stays
 * the same. Values are merged over defaults so adding a new field later is safe.
 */
export function useLocalPrefs<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): [T, (patch: Partial<T>) => void, boolean] {
  const [prefs, setPrefs] = useState<T>(defaults);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPrefs(readPrefs(key, defaults));
    setLoaded(true);
  }, [key]); // defaults is a literal per call site; intentionally not a dep

  const update = useCallback(
    (patch: Partial<T>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        if (typeof window !== "undefined") {
          window.localStorage.setItem(key, JSON.stringify(next));
        }
        return next;
      });
    },
    [key],
  );

  return [prefs, update, loaded];
}

/** Pure read+merge so it can be unit-checked without React. */
export function readPrefs<T extends Record<string, unknown>>(key: string, defaults: T): T {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return { ...defaults, ...parsed };
    return defaults;
  } catch {
    return defaults;
  }
}
