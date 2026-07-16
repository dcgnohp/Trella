import { describe, expect, it } from "vitest"

import { parseSseChunk } from "@/lib/ai/use-chat"

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
