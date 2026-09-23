import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRealtimeUrl, isRealtimeEnabled } from "@/lib/realtime/config";

const ENV_KEY = "NEXT_PUBLIC_REALTIME_URL";

describe("realtime config gating", () => {
  const original = process.env[ENV_KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  describe("when no WebSocket origin is configured (default / disabled)", () => {
    beforeEach(() => {
      delete process.env[ENV_KEY];
    });

    it("isRealtimeEnabled() is false", () => {
      expect(isRealtimeEnabled()).toBe(false);
    });

    it("buildRealtimeUrl() returns null (no-op)", () => {
      expect(buildRealtimeUrl("/ws/projects/p1")).toBeNull();
    });

    it("treats blank/whitespace as disabled", () => {
      process.env[ENV_KEY] = "   ";
      expect(buildRealtimeUrl("/ws/notifications")).toBeNull();
    });
  });

  describe("when a WebSocket origin is configured", () => {
    beforeEach(() => {
      process.env[ENV_KEY] = "ws://localhost:8000";
    });

    it("builds a fully-qualified URL and normalises the path", () => {
      expect(buildRealtimeUrl("/ws/projects/p1")).toBe(
        "ws://localhost:8000/ws/projects/p1",
      );
      // Missing leading slash is added.
      expect(buildRealtimeUrl("ws/notifications")).toBe(
        "ws://localhost:8000/ws/notifications",
      );
    });

    it("strips a trailing slash on the configured origin", () => {
      process.env[ENV_KEY] = "ws://localhost:8000/";
      expect(buildRealtimeUrl("/ws/projects/p1")).toBe(
        "ws://localhost:8000/ws/projects/p1",
      );
    });

    it("appends an auth token as a query parameter when provided", () => {
      expect(buildRealtimeUrl("/ws/projects/p1", "abc def")).toBe(
        "ws://localhost:8000/ws/projects/p1?token=abc%20def",
      );
    });
  });
});
