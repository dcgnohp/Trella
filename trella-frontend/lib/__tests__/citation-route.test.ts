import { describe, it, expect } from "vitest"

import { citationRoute } from "@/lib/ai/citation-route"

describe("citationRoute", () => {
  it("routes a document to the docs page", () => {
    expect(
      citationRoute({ id: "d1", title: "Doc", workspaceId: "w1", type: "document" }),
    ).toBe("/workspaces/w1/docs/d1")
  })

  it("routes a task with a board to that board with ?task=", () => {
    expect(
      citationRoute({ id: "t1", title: "T", workspaceId: "w1", type: "task", boardId: "b1" }),
    ).toBe("/workspaces/w1/boards/b1?task=t1")
  })

  it("falls back to backlog ?task= when a task has no board", () => {
    expect(
      citationRoute({ id: "t2", title: "T", workspaceId: "w1", type: "task" }),
    ).toBe("/workspaces/w1/backlog?task=t2")
  })

  it("routes a sprint to the workspace backlog", () => {
    expect(
      citationRoute({ id: "s1", title: "S", workspaceId: "w1", type: "sprint" }),
    ).toBe("/workspaces/w1/backlog")
  })
})
