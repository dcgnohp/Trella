import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  parseRealtimeEvent,
  taskIdOf,
  type RealtimeEvent,
} from "@/lib/realtime/events";

describe("parseRealtimeEvent", () => {
  it("parses a well-formed task event", () => {
    const raw = JSON.stringify({
      event: "task.updated",
      project_id: "p1",
      payload: { task_id: "t1", changed_fields: ["title"] },
    });
    const parsed = parseRealtimeEvent(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.event).toBe("task.updated");
    expect(parsed?.project_id).toBe("p1");
    expect(parsed?.payload?.task_id).toBe("t1");
  });

  it("parses a well-formed notification event", () => {
    const raw = JSON.stringify({
      event: "notification.created",
      user_id: "u1",
      payload: { notification_id: "n1", title: "Assigned" },
    });
    const parsed = parseRealtimeEvent(raw);
    expect(parsed?.event).toBe("notification.created");
    expect(parsed?.user_id).toBe("u1");
  });

  it("returns null for unknown event names", () => {
    expect(
      parseRealtimeEvent(JSON.stringify({ event: "task.exploded" })),
    ).toBeNull();
  });

  it("returns null for malformed / non-string / non-JSON input", () => {
    expect(parseRealtimeEvent("")).toBeNull();
    expect(parseRealtimeEvent("not json")).toBeNull();
    expect(parseRealtimeEvent("{ bad")).toBeNull();
    expect(parseRealtimeEvent(JSON.stringify({ no: "event" }))).toBeNull();
    expect(parseRealtimeEvent(JSON.stringify(42))).toBeNull();
    expect(parseRealtimeEvent(JSON.stringify(null))).toBeNull();
    // Non-string raw values are rejected outright.
    expect(parseRealtimeEvent(123 as unknown)).toBeNull();
    expect(parseRealtimeEvent({} as unknown)).toBeNull();
    expect(parseRealtimeEvent(undefined as unknown)).toBeNull();
  });

  it("never throws on arbitrary input (property)", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        // Must total: any untrusted frame yields an event or null, never throws.
        const result = parseRealtimeEvent(input as unknown);
        expect(result === null || typeof result.event === "string").toBe(true);
      }),
    );
  });

  it("never throws on arbitrary JSON strings (property)", () => {
    fc.assert(
      fc.property(fc.json(), (jsonStr) => {
        expect(() => parseRealtimeEvent(jsonStr)).not.toThrow();
      }),
    );
  });
});

describe("taskIdOf", () => {
  it("extracts a present task_id", () => {
    const event: RealtimeEvent = {
      event: "comment.created",
      payload: { task_id: "t9" },
    };
    expect(taskIdOf(event)).toBe("t9");
  });

  it("returns null when task_id is absent or not a string", () => {
    expect(taskIdOf({ event: "task.updated" })).toBeNull();
    expect(
      taskIdOf({ event: "task.updated", payload: { task_id: 5 } }),
    ).toBeNull();
    expect(
      taskIdOf({ event: "task.updated", payload: { task_id: "" } }),
    ).toBeNull();
  });
});
