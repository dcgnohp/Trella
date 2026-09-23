import { afterEach, describe, expect, it, vi } from "vitest"

import { summarizeDoc } from "@/lib/ai/use-summarize-doc"
import { AiService } from "@/lib/client"

describe("summarizeDoc", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls AiService.Ai_aiAiSummarizeDocument with the payload as requestBody and returns its result", async () => {
    const response = {
      summary: "Short document summary",
      keyPoints: ["point"],
      keyDecisions: ["decision"],
      actionItems: ["do the thing"],
    }
    const spy = vi
      .spyOn(AiService, "Ai_aiAiSummarizeDocument")
      // Cast: the generated method returns a CancelablePromise, but the
      // mutationFn only awaits it — a resolved value is sufficient here.
      .mockResolvedValue(response as never)

    const payload = { content: "A long document body", title: "Doc" }
    const result = await summarizeDoc(payload)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ requestBody: payload })
    expect(result).toBe(response)
  })

  it("propagates errors from the service", async () => {
    vi.spyOn(AiService, "Ai_aiAiSummarizeDocument").mockRejectedValue(
      new Error("service exploded") as never,
    )

    await expect(summarizeDoc({ content: "x" })).rejects.toThrow(
      "service exploded",
    )
  })
})
