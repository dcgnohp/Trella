import { describe, expect, it } from "vitest"

import { aggregateTurn, collectPlanFromEvents, parseSseChunk } from "@/lib/ai/use-chat"

describe("parseSseChunk", () => {
  it("parses multiple complete frames and keeps an incomplete trailing frame in rest", () => {
    const buffer =
      "event: start\ndata: {}\n\n" +
      'event: delta\ndata: {"text":"Hello"}\n\n' +
      "event: done\ndata: {}\n\n" +
      "event: delta\ndata: {" // incomplete trailing frame

    const { events, rest } = parseSseChunk(buffer)

    expect(events).toEqual([
      { event: "start", data: "{}" },
      { event: "delta", data: '{"text":"Hello"}' },
      { event: "done", data: "{}" },
    ])
    expect(rest).toBe("event: delta\ndata: {")
  })

  it("parses a delta frame's data JSON to { text }", () => {
    const { events, rest } = parseSseChunk('event: delta\ndata: {"text":"Hi there"}\n\n')

    expect(rest).toBe("")
    expect(events).toHaveLength(1)
    expect(events[0].event).toBe("delta")
    expect(JSON.parse(events[0].data)).toEqual({ text: "Hi there" })
  })

  it("returns no events and the whole buffer as rest when no frame is complete", () => {
    const { events, rest } = parseSseChunk("event: delta\ndata: {\"text\":\"partial\"")
    expect(events).toEqual([])
    expect(rest).toBe('event: delta\ndata: {"text":"partial"')
  })
})

describe("aggregateTurn (reasoning path)", () => {
  it("folds progress + tool_call + tool_result + delta into text/activity/dataSources", () => {
    const buffer =
      "event: start\ndata: {}\n\n" +
      'event: progress\ndata: {"type":"searching_tasks","label":"Searching tasks","timestamp":"2024-01-01T00:00:00Z"}\n\n' +
      'event: tool_call\ndata: {"name":"search_tasks","capability":null,"timestamp":"2024-01-01T00:00:01Z"}\n\n' +
      'event: tool_result\ndata: {"name":"search_tasks","ok":true,"source":"task","timestamp":"2024-01-01T00:00:02Z"}\n\n' +
      'event: delta\ndata: {"text":"Here are your tasks."}\n\n' +
      "event: done\ndata: {}\n\n"

    const { events } = parseSseChunk(buffer)
    const { text, activity, dataSources } = aggregateTurn(events)

    expect(text).toBe("Here are your tasks.")
    expect(activity).toContainEqual({
      type: "searching_tasks",
      label: "Searching tasks",
      timestamp: "2024-01-01T00:00:00Z",
    })
    expect(dataSources).toEqual(["task"])
  })

  it("ignores a malformed progress frame without throwing", () => {
    const buffer =
      "event: progress\ndata: {not json\n\n" +
      'event: delta\ndata: {"text":"ok"}\n\n'

    const { events } = parseSseChunk(buffer)
    const result = aggregateTurn(events)

    expect(result.activity).toEqual([])
    expect(result.text).toBe("ok")
  })

  it("de-duplicates repeated identical source values in dataSources", () => {
    const buffer =
      'event: tool_result\ndata: {"name":"a","ok":true,"source":"task","timestamp":"t1"}\n\n' +
      'event: tool_result\ndata: {"name":"b","ok":true,"source":"task","timestamp":"t2"}\n\n' +
      'event: tool_result\ndata: {"name":"c","ok":true,"source":"sprint","timestamp":"t3"}\n\n'

    const { events } = parseSseChunk(buffer)
    const { dataSources } = aggregateTurn(events)

    expect(dataSources).toEqual(["task", "sprint"])
  })

  it("skips tool_result frames that failed or lack a source", () => {
    const buffer =
      'event: tool_result\ndata: {"name":"a","ok":false,"source":"task","timestamp":"t1"}\n\n' +
      'event: tool_result\ndata: {"name":"b","ok":true,"source":null,"timestamp":"t2"}\n\n'

    const { events } = parseSseChunk(buffer)
    const { dataSources } = aggregateTurn(events)

    expect(dataSources).toEqual([])
  })

  it("folds document citations from a semantic tool_result, deduped by id", () => {
    const buffer =
      'event: tool_result\ndata: {"name":"semantic_search_documents","ok":true,"source":"knowledge","citations":[{"type":"document","id":"d1","title":"Auth Guide","workspace_id":"w1"},{"type":"document","id":"d2","title":"Deploy","workspace_id":"w1"}]}\n\n' +
      'event: tool_result\ndata: {"name":"semantic_search_documents","ok":true,"source":"knowledge","citations":[{"type":"document","id":"d1","title":"Auth Guide","workspace_id":"w1"}]}\n\n'

    const { events } = parseSseChunk(buffer)
    const { citations } = aggregateTurn(events)

    expect(citations).toEqual([
      {
        id: "d1",
        title: "Auth Guide",
        workspaceId: "w1",
        type: "document",
        issueKey: undefined,
        boardId: undefined,
      },
      {
        id: "d2",
        title: "Deploy",
        workspaceId: "w1",
        type: "document",
        issueKey: undefined,
        boardId: undefined,
      },
    ])
  })

  it("yields no citations for a failed frame or one without citations", () => {
    const buffer =
      'event: tool_result\ndata: {"name":"a","ok":true,"source":"task"}\n\n' +
      'event: tool_result\ndata: {"name":"b","ok":false,"source":"knowledge","citations":[{"type":"document","id":"d1","title":"X","workspace_id":"w1"}]}\n\n'

    const { events } = parseSseChunk(buffer)
    const { citations } = aggregateTurn(events)

    expect(citations).toEqual([])
  })
})

describe("collectPlanFromEvents (approval path)", () => {
  it("folds two action_proposal frames + plan_ready into a PendingPlan", () => {
    const buffer =
      'event: action_proposal\ndata: {"actionId":"a1","toolName":"create_task","preview":"Create task \\"Ship it\\"","capability":"task:write","timestamp":"t1"}\n\n' +
      'event: action_proposal\ndata: {"actionId":"a2","toolName":"assign_task","preview":"Assign to Dana","capability":null,"timestamp":"t2"}\n\n' +
      'event: plan_ready\ndata: {"planId":"plan-123","actionCount":2,"timestamp":"t3"}\n\n'

    const { events } = parseSseChunk(buffer)
    const plan = collectPlanFromEvents(events)

    expect(plan).not.toBeNull()
    expect(plan?.planId).toBe("plan-123")
    expect(plan?.proposals).toHaveLength(2)
    expect(plan?.proposals[0]).toEqual({
      actionId: "a1",
      toolName: "create_task",
      preview: 'Create task "Ship it"',
      capability: "task:write",
    })
    expect(plan?.proposals[1].toolName).toBe("assign_task")
    expect(plan?.proposals[1].capability).toBeNull()
  })

  it("returns null when no plan_ready frame arrives (proposals not actionable)", () => {
    const buffer =
      'event: action_proposal\ndata: {"actionId":"a1","toolName":"create_task","preview":"Create task","capability":null,"timestamp":"t1"}\n\n' +
      'event: done\ndata: {}\n\n'

    const { events } = parseSseChunk(buffer)
    expect(collectPlanFromEvents(events)).toBeNull()
  })

  it("ignores a malformed action_proposal frame without throwing", () => {
    const buffer =
      "event: action_proposal\ndata: {not json\n\n" +
      'event: action_proposal\ndata: {"actionId":"a2","toolName":"assign_task","preview":"Assign","capability":null,"timestamp":"t2"}\n\n' +
      'event: plan_ready\ndata: {"planId":"plan-9","actionCount":1,"timestamp":"t3"}\n\n'

    const { events } = parseSseChunk(buffer)
    const plan = collectPlanFromEvents(events)

    expect(plan?.planId).toBe("plan-9")
    expect(plan?.proposals).toHaveLength(1)
    expect(plan?.proposals[0].actionId).toBe("a2")
  })

  it("dedupes repeated proposals by actionId", () => {
    const buffer =
      'event: action_proposal\ndata: {"actionId":"a1","toolName":"create_task","preview":"Create","capability":null,"timestamp":"t1"}\n\n' +
      'event: action_proposal\ndata: {"actionId":"a1","toolName":"create_task","preview":"Create","capability":null,"timestamp":"t1"}\n\n' +
      'event: plan_ready\ndata: {"planId":"plan-1","actionCount":1,"timestamp":"t2"}\n\n'

    const { events } = parseSseChunk(buffer)
    expect(collectPlanFromEvents(events)?.proposals).toHaveLength(1)
  })
})
