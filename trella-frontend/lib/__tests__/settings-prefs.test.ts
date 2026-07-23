import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { readPrefs } from "@/app/(platform)/(dashboard)/workspaces/[workspaceId]/settings/_components/use-local-prefs";

const DEFAULTS = { a: 1, b: "x", c: true };

// Node test environment has no DOM, so shim the slice of window that
// readPrefs touches. This lets us exercise the browser code path directly.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
});
afterAll(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("readPrefs", () => {
  it("returns defaults when key is missing", () => {
    expect(readPrefs("missing", DEFAULTS)).toEqual(DEFAULTS);
  });

  it("merges a partial stored value over defaults", () => {
    store.set("partial", JSON.stringify({ a: 9 }));
    expect(readPrefs("partial", DEFAULTS)).toEqual({ a: 9, b: "x", c: true });
  });

  it("falls back to defaults on corrupt JSON", () => {
    store.set("corrupt", "{not json");
    expect(readPrefs("corrupt", DEFAULTS)).toEqual(DEFAULTS);
  });

  it("falls back to defaults on non-object JSON", () => {
    store.set("scalar", "42");
    expect(readPrefs("scalar", DEFAULTS)).toEqual(DEFAULTS);
  });
});
