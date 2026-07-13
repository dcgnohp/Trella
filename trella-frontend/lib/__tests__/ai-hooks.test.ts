import { afterEach, describe, expect, it, vi } from "vitest"

import { generateDescription } from "@/lib/ai/use-generate-description"
import { summarizeTask } from "@/lib/ai/use-summarize-task"
import { AiService } from "@/lib/client"

describe("generateDescription", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls AiService.Ai_aiAiGenerateDescription with the payload as requestBody and returns its result", async () => {
    const response = {
      description: "A structured description",
      acceptanceCriteria: ["AC1"],
      technicalNotes: ["TN1"],
      definitionOfDone: ["DoD1"],
    }
    const spy = vi
      .spyOn(AiService, "Ai_aiAiGenerateDescription")
      // Cast: the generated method returns a CancelablePromise, but the
      // mutationFn only awaits it — a resolved value is sufficient here.
      .mockResolvedValue(response as never)

    const payload = { title: "Add login", priority: "high" }
    const result = await generateDescription(payload)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ requestBody: payload })
    expect(result).toBe(response)
  })

  it("propagates errors from the service", async () => {
    vi.spyOn(AiService, "Ai_aiAiGenerateDescription").mockRejectedValue(
      new Error("service exploded") as never,
    )

    await expect(generateDescription({ title: "x" })).rejects.toThrow(
      "service exploded",
    )
  })
})

describe("summarizeTask", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("calls AiService.Ai_aiAiSummarizeTask with the payload as requestBody and returns its result", async () => {
    const response = {
      summary: "Short summary",
      risks: ["risk"],
      actionItems: ["do the thing"],
    }
    const spy = vi
      .spyOn(AiService, "Ai_aiAiSummarizeTask")
      .mockResolvedValue(response as never)

    const payload = { description: "A long task description", title: "Task" }
    const result = await summarizeTask(payload)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({ requestBody: payload })
    expect(result).toBe(response)
  })
})
