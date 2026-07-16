import { describe, expect, it } from "vitest";

import {
  buildConversationContext,
  type ContextContribution,
} from "@/lib/ai/conversation-context";

describe("buildConversationContext", () => {
  it("omits sections that have no data", () => {
    expect(buildConversationContext([])).toEqual({});
    expect(buildConversationContext([{ workspace: {} }])).toEqual({});
  });

  it("formats workspace, board+tasks (project), sprint, task and knowledge", () => {
    const contributions: ContextContribution[] = [
      { workspace: { name: "Acme", mode: "SCRUM" } },
      {
        board: { title: "Delivery", columns: ["To Do", "Doing", "Done"] },
        tasks: [
          { title: "Login page", status: "Doing" },
          { title: "Signup", status: "To Do" },
        ],
        sprint: { name: "Sprint 3", goal: "Ship auth", status: "ACTIVE" },
        task: {
          title: "Login page",
          issueKey: "ACME-12",
          status: "Doing",
          priority: "HIGH",
          storyPoint: 5,
          description: "Build OAuth login.",
        },
      },
      { knowledge: { title: "Auth spec", summary: "Use OAuth2." } },
    ];

    const ctx = buildConversationContext(contributions);

    expect(ctx.workspace).toContain("Name: Acme");
    expect(ctx.workspace).toContain("Mode: SCRUM");
    expect(ctx.project).toContain("Board: Delivery");
    expect(ctx.project).toContain("Columns: To Do, Doing, Done");
    expect(ctx.project).toContain("Tasks (2):");
    expect(ctx.project).toContain("- Login page (Doing)");
    expect(ctx.sprint).toContain("Sprint 3");
    expect(ctx.sprint).toContain("Goal: Ship auth");
    expect(ctx.task).toContain("#ACME-12: Login page");
    expect(ctx.task).toContain("Story points: 5");
    expect(ctx.task).toContain("Build OAuth login.");
    expect(ctx.knowledge).toContain("Title: Auth spec");
    expect(ctx.knowledge).toContain("Use OAuth2.");
  });

  it("trims a long task list and reports the overflow count", () => {
    const tasks = Array.from({ length: 25 }, (_, i) => ({
      title: `Task ${i}`,
      status: "To Do",
    }));
    const ctx = buildConversationContext([{ tasks }]);
    expect(ctx.project).toContain("Tasks (25):");
    expect(ctx.project).toContain("…and 5 more");
    expect(ctx.project).not.toContain("Task 20");
  });

  it("truncates an oversized description", () => {
    const long = "x".repeat(1000);
    const ctx = buildConversationContext([{ task: { title: "T", description: long } }]);
    // 600-char cap + ellipsis, well under the raw 1000.
    expect(ctx.task!.length).toBeLessThan(700);
    expect(ctx.task).toContain("…");
  });
});
