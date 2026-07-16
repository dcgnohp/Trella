import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Phase 4 — Conversational AI (AI Chat) end-to-end flow.
 *
 * Covers: open chat panel -> send -> streamed reply renders incrementally ->
 * Stop generating mid-stream -> error + retry -> clear/new chat.
 *
 * The streaming proxy route (`POST /api/ai/chat`) is mocked via route
 * interception so this test needs NO live OpenAI/Gemini key and is
 * deterministic. It exercises the real `useChat` SSE parser + panel UI wiring
 * (named events start/delta/done, AbortController cancellation).
 *
 * SETUP (app-specific — fill in for your environment):
 *  - E2E_BASE_URL points at a running frontend (default http://localhost:3000).
 *  - E2E_EMAIL / E2E_PASSWORD establish an authenticated session.
 *  - E2E_WORKSPACE_ID is any workspace whose layout mounts <AiChatPanel/>.
 */

const CHAT_URL = "**/api/ai/chat";

const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
const WORKSPACE_ID = process.env.E2E_WORKSPACE_ID ?? "";

/** Build a valid SSE body with named events matching the frozen protocol:
 *  `start` -> one `delta` per chunk (`data: {"text": "..."}`) -> `done`. */
function sseBody(chunks: string[]): string {
  const frames = ["event: start\ndata: {}\n\n"];
  for (const c of chunks) {
    frames.push(`event: delta\ndata: ${JSON.stringify({ text: c })}\n\n`);
  }
  frames.push("event: done\ndata: {}\n\n");
  return frames.join("");
}

/** Fulfill a mocked chat request with an event-stream body. */
async function fulfillSse(route: Route, chunks: string[]): Promise<void> {
  await route.fulfill({
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    body: sseBody(chunks),
  });
}

/** Log in by exchanging credentials for a JWT and injecting the auth cookie —
 *  avoids driving the sign-in UI. Requires E2E_EMAIL / E2E_PASSWORD. */
async function login(page: Page): Promise<void> {
  if (!E2E_EMAIL || !E2E_PASSWORD) {
    throw new Error("Set E2E_EMAIL and E2E_PASSWORD env vars.");
  }
  const res = await page.request.post(`${API_URL}/api/v1/login/access-token`, {
    form: { username: E2E_EMAIL, password: E2E_PASSWORD },
  });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
  const { access_token } = (await res.json()) as { access_token: string };
  const base = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000");
  await page.context().addCookies([
    {
      name: "access_token",
      value: access_token,
      domain: base.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** Navigate to a workspace (its layout mounts the chat panel) and open it. */
async function openChat(page: Page): Promise<void> {
  if (!WORKSPACE_ID) throw new Error("Set E2E_WORKSPACE_ID env var.");
  await page.goto(`/workspaces/${WORKSPACE_ID}`);
  await page.getByTestId("ai-chat-fab").click();
  await expect(page.getByTestId("ai-chat-panel")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await openChat(page);
});

test("send -> streamed reply renders + payload carries page context", async ({
  page,
}) => {
  let postedBody: unknown = null;
  await page.route(CHAT_URL, async (route) => {
    postedBody = route.request().postDataJSON();
    await fulfillSse(route, ["Hello", ", how ", "can I help?"]);
  });

  await page.getByTestId("ai-chat-input").fill("Hi there");
  await page.getByTestId("ai-chat-send").click();

  // The concatenated assistant reply appears (deltas joined by the parser).
  await expect(page.getByTestId("ai-chat-messages")).toContainText(
    "Hello, how can I help?",
  );
  // Send is available again once the stream finished (isStreaming -> false).
  await expect(page.getByTestId("ai-chat-send")).toBeVisible();

  // Phase 4 completion: the request now carries a populated ConversationContext
  // built from the current page (payload-mode). On a workspace/board page the
  // header contributes at least the workspace section.
  const body = postedBody as { messages?: unknown[]; context?: Record<string, unknown> };
  expect(body.context).toBeTruthy();
  expect(Object.keys(body.context ?? {}).length).toBeGreaterThan(0);
});

test("stop generating cancels mid-stream", async ({ page }) => {
  // Delay the response so the request is in-flight (isStreaming = true) long
  // enough to click Stop. Aborting the fetch resolves send() without content.
  await page.route(CHAT_URL, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await fulfillSse(route, ["late"]);
  });

  await page.getByTestId("ai-chat-input").fill("Take your time");
  await page.getByTestId("ai-chat-send").click();

  // While in-flight the Stop button replaces Send.
  const stop = page.getByTestId("ai-chat-stop");
  await expect(stop).toBeVisible();
  await stop.click();

  // Abort returns to the idle state (Send visible again), no error surfaced.
  await expect(page.getByTestId("ai-chat-send")).toBeVisible();
  await expect(page.getByText("Message failed")).toBeHidden();
});

test("error event -> retry succeeds", async ({ page }) => {
  let calls = 0;
  await page.route(CHAT_URL, async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
        body:
          "event: start\ndata: {}\n\n" +
          `event: error\ndata: ${JSON.stringify({ message: "AI is down" })}\n\n`,
      });
    } else {
      await fulfillSse(route, ["Recovered ", "reply"]);
    }
  });

  await page.getByTestId("ai-chat-input").fill("Explain the sprint");
  await page.getByTestId("ai-chat-send").click();

  // First attempt surfaces the error card with the streamed message.
  await expect(page.getByText("Message failed")).toBeVisible();
  await expect(page.getByText("AI is down")).toBeVisible();

  // Retry resends the last user turn and succeeds.
  await page.getByTestId("ai-chat-retry").click();
  await expect(page.getByTestId("ai-chat-messages")).toContainText(
    "Recovered reply",
  );
});

test("clear starts a new chat", async ({ page }) => {
  await page.route(CHAT_URL, (route) => fulfillSse(route, ["Some answer"]));

  await page.getByTestId("ai-chat-input").fill("First question");
  await page.getByTestId("ai-chat-send").click();
  await expect(page.getByTestId("ai-chat-messages")).toContainText("Some answer");

  await page.getByTestId("ai-chat-clear").click();

  // Conversation is emptied -> the empty-state hint returns.
  await expect(
    page.getByText("Ask anything to get started.", { exact: false }),
  ).toBeVisible();
});
