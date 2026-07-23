import { describe, expect, it } from "vitest";

import { pointsToWorkingDays } from "@/lib/sprint-velocity";

describe("pointsToWorkingDays", () => {
  it("maps 8 story points to 4 working days at the default 2 pts/day", () => {
    expect(pointsToWorkingDays(8)).toBe(4);
  });

  it("rounds partial days up so no work is silently dropped", () => {
    expect(pointsToWorkingDays(5)).toBe(3); // 5/2 = 2.5 -> 3
    expect(pointsToWorkingDays(1)).toBe(1);
  });

  it("honours a custom velocity", () => {
    expect(pointsToWorkingDays(12, 3)).toBe(4);
  });

  it("returns 0 for non-positive or invalid input", () => {
    expect(pointsToWorkingDays(0)).toBe(0);
    expect(pointsToWorkingDays(-4)).toBe(0);
    expect(pointsToWorkingDays(Number.NaN)).toBe(0);
    expect(pointsToWorkingDays(8, 0)).toBe(0);
  });
});
