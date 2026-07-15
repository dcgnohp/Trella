import { afterEach, describe, expect, it, vi } from "vitest"

import { postGenerate } from "@/lib/ai/use-ai"
import { AiService } from "@/lib/client"

describe("postGenerate", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls AiService.Ai_aiAiGenerate with the payload as requestBody and returns its result", async () => {
    const response = {
      content: "pong",
      model: "gpt-4.1",
      provider: "openai",
      latencyMs: 12,
    }
    const spy = vi
      .spyOn(AiService, "Ai_aiAiGenerate")
      .mockResolvedValue(response as never)

    const payload = { prompt: "_ping", variables: { message: "x" } }
    const result = await postGenerate(payload)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ requestBody: payload })
    expect(result).toBe(response)
  })

  it("propagates errors from the service", async () => {
    vi.spyOn(AiService, "Ai_aiAiGenerate").mockRejectedValue(
      new Error("slow down") as never,
    )

    await expect(postGenerate({ prompt: "_ping" })).rejects.toThrow("slow down")
  })
})
