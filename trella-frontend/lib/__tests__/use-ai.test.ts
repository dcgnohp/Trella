import { afterEach, describe, expect, it, vi } from "vitest"

import { postGenerate } from "@/lib/ai/use-ai"

describe("postGenerate", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("POSTs JSON to the proxied /api/v1/ai/generate and returns the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: "hi",
        model: "gpt-4.1",
        provider: "openai",
        latencyMs: 12,
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await postGenerate({ prompt: "_ping", variables: { message: "x" } })

    expect(result.content).toBe("hi")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/v1/ai/generate")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({
      prompt: "_ping",
      variables: { message: "x" },
    })
  })

  it("throws with the backend error detail message on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Too Many Requests",
        json: async () => ({ detail: { code: "rate_limited", message: "slow down" } }),
      }),
    )

    await expect(postGenerate({ prompt: "_ping" })).rejects.toThrow("slow down")
  })
})
