import { describe, expect, it } from "vitest";

import { isTaskVisibleOnScrumBoard } from "@/lib/board/scrum-board-filter";

describe("isTaskVisibleOnScrumBoard", () => {
  it("Kanban shows every task regardless of sprint", () => {
    expect(isTaskVisibleOnScrumBoard(null, false, null)).toBe(true);
    expect(isTaskVisibleOnScrumBoard("s1", false, "s2")).toBe(true);
  });

  it("Scrum shows only tasks in the active sprint", () => {
    expect(isTaskVisibleOnScrumBoard("s1", true, "s1")).toBe(true);
    expect(isTaskVisibleOnScrumBoard("s2", true, "s1")).toBe(false);
  });

  it("Scrum hides backlog tasks (no sprint)", () => {
    expect(isTaskVisibleOnScrumBoard(null, true, "s1")).toBe(false);
    expect(isTaskVisibleOnScrumBoard(undefined, true, "s1")).toBe(false);
  });

  it("Scrum with no active sprint hides everything, including backlog", () => {
    expect(isTaskVisibleOnScrumBoard("s1", true, null)).toBe(false);
    expect(isTaskVisibleOnScrumBoard(null, true, null)).toBe(false);
  });
});
