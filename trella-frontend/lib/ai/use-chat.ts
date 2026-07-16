import { useCallback, useRef, useState } from "react"

/** A single chat message. `id` + `timestamp` are set from the start so future
 *  persistence/sync (P4-B2) does not require a schema change. */
export interface ChatMessage {
  id: string
  timestamp: string
  role: "system" | "user" | "assistant" | "tool"
  content: string
}

/** Structured conversation context (design decision #6) — sent alongside
 *  messages so the backend can ground responses without a free-text blob. */
export interface ConversationContext {
  workspace?: string
  project?: string
  sprint?: string
  task?: string
  knowledge?: string
}

/**
 * Pure SSE frame parser. Splits a buffer into complete `\n\n`-terminated
 * frames and returns any incomplete trailing frame as `rest`. Each frame is
 * scanned for `event:` and `data:` lines (data lines are concatenated per the
 * SSE spec). Dependency-free so it can be unit-tested in a node env.
 */
export function parseSseChunk(buffer: string): {
  events: { event: string; data: string }[]
  rest: string
} {
  const events: { event: string; data: string }[] = []
  // The last element is the leftover (no trailing blank line yet).
  const parts = buffer.split("\n\n")
  const rest = parts.pop() ?? ""

  for (const frame of parts) {
    if (!frame.trim()) continue
    let event = "message"
    const dataLines: string[] = []
    for (const rawLine of frame.split("\n")) {
      const line = rawLine.replace(/\r$/, "")
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim()
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim())
      }
    }
    events.push({ event, data: dataLines.join("\n") })
  }

  return { events, rest }
}

function newMessage(
  role: ChatMessage["role"],
  content: string,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    role,
    content,
  }
}

export interface UseChatResult {
  messages: ChatMessage[]
  send: (text: string, context?: ConversationContext) => Promise<void>
  stop: () => void
  isStreaming: boolean
  error: string | null
  clear: () => void
}

/**
 * Chat hook: manages message state and streams assistant replies from
 * `POST /api/ai/chat` (SSE named events: start/delta/usage/error/done).
 * Cancellation ("Stop generating", decision #8) via an AbortController.
 */
export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
  }, [])

  const send = useCallback(
    async (text: string, context?: ConversationContext) => {
      setError(null)

      const userMsg = newMessage("user", text)
      const assistantMsg = newMessage("assistant", "")
      // Snapshot the outbound history (excludes the empty assistant placeholder).
      const outbound = [...messages, userMsg]
      setMessages([...outbound, assistantMsg])

      const controller = new AbortController()
      abortRef.current = controller
      setIsStreaming(true)

      const appendToAssistant = (chunk: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: m.content + chunk }
              : m,
          ),
        )
      }

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: outbound, context }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          throw new Error(`Chat request failed (${res.status})`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        // Reads until the stream ends, a `done`/`error` event arrives, or abort.
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const { events, rest } = parseSseChunk(buffer)
          buffer = rest

          let finished = false
          for (const { event, data } of events) {
            if (event === "delta") {
              try {
                const parsed = JSON.parse(data) as { text?: string }
                if (parsed.text) appendToAssistant(parsed.text)
              } catch {
                // ponytail: ignore malformed delta frame rather than aborting
                // the whole stream — a dropped token beats a dead conversation.
              }
            } else if (event === "error") {
              let message = "Chat stream error"
              try {
                const parsed = JSON.parse(data) as { message?: string }
                if (parsed.message) message = parsed.message
              } catch {
                /* keep default message */
              }
              setError(message)
              finished = true
              break
            } else if (event === "done") {
              finished = true
              break
            }
          }
          if (finished) {
            await reader.cancel().catch(() => {})
            break
          }
        }
      } catch (err) {
        // An abort is a user action ("Stop generating"), not an error.
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : "Chat stream error")
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [messages],
  )

  return { messages, send, stop, isStreaming, error, clear }
}
