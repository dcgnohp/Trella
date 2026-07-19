import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Phase 9 — Knowledge Intelligence 2.0 (Semantic Search / RAG) E2E.
 *
 * Two groups:
 *  A) MOCKED (deterministic, no live key): intercepts `POST /api/ai/chat` and
 *     emits a `tool_result` frame carrying document `citations`, then asserts
 *     the dedicated "Sources" section renders and a source click opens the doc.
 *     Exercises the real `useChat` citation parser + `SourcesSection` UI.
 *  B) LIVE (env-bound): runs against a live stack with semantic search ENABLED
 *     and a real embedding key. Covers real semantic retrieval, permission
 *     isolation across users, and realtime embedding sync. Skipped unless
 *     `E2E_LIVE_SEMANTIC=1`.
 *
 * SETUP (env):
 *  - E2E_BASE_URL (frontend, default http://localhost:3000)
 *  - E2E_API_URL  (backend, default http://127.0.0.1:8000)
 *  - E2E_EMAIL / E2E_PASSWORD           (user A — member of E2E_WORKSPACE_ID)
 *  - E2E_WORKSPACE_ID                   (workspace whose layout mounts <AiChatPanel/>)
 *  Live-only:
 *  - E2E_LIVE_SEMANTIC=1                 (enable group B)
 *  - E2E_EMAIL_2 / E2E_PASSWORD_2        (user B — NOT a member of E2E_WORKSPACE_ID)
 *  - Backend started with AI_SEMANTIC_SEARCH_ENABLED=true + embedding provider/model/dim.
 */

const CHAT_URL = "**/api/ai/chat";
const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
const WORKSPACE_ID = process.env.E2E_WORKSPACE_ID ?? "";
const LIVE = process.env.E2E_LIVE_SEMANTIC === "1";

/** Exchange credentials for a JWT and inject the auth cookie (skip the UI). */
async function loginAs(page: Page, email: string, password: string): Promise<string> {
  const res = await page.request.post(`${API_URL}/api/v1/login/access-token`, {
    form: { username: email, password },
  });
  if (!res.ok()) throw new Error(`login failed for ${email}: ${res.status()}`);
  const { access_token } = (await res.json()) as { access_token: string };
  const base = new URL(BASE_URL);
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
  return access_token;
}

async function openChat(page: Page, workspaceId: string): Promise<void> {
  // Navigate to a real sub-route (the workspace layout that mounts <AiChatPanel/>
  // has no page at the bare /workspaces/{id} segment).
  await page.goto(`/workspaces/${workspaceId}/boards`);
  await page.getByTestId("ai-chat-fab").click();
  await expect(page.getByTestId("ai-chat-panel")).toBeVisible();
}

// --------------------------------------------------------------------------- //
// Group A — MOCKED citation rendering (deterministic, no live key)            //
// --------------------------------------------------------------------------- //
test.describe("semantic citations (mocked)", () => {
  test.skip(!E2E_EMAIL || !E2E_PASSWORD || !WORKSPACE_ID, "requires E2E auth env");

  /** SSE that simulates a semantic tool run: tool_call -> tool_result(+citations)
   *  -> answer delta -> done. `citations` uses snake_case workspace_id (backend). */
  function sseWithCitations(
    citations: { id: string; title: string; workspace_id: string }[],
  ): string {
    return (
      "event: start\ndata: {}\n\n" +
      `event: tool_call\ndata: ${JSON.stringify({ name: "semantic_search_documents", capability: "document.semantic_search", timestamp: "t1" })}\n\n` +
      `event: tool_result\ndata: ${JSON.stringify({ name: "semantic_search_documents", ok: true, source: "knowledge", citations, timestamp: "t2" })}\n\n` +
      `event: delta\ndata: ${JSON.stringify({ text: "Based on the docs, here is the answer." })}\n\n` +
      "event: done\ndata: {}\n\n"
    );
  }

  async function fulfill(route: Route, body: string): Promise<void> {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body,
    });
  }

  test.beforeEach(async ({ page }) => {
    await loginAs(page, E2E_EMAIL, E2E_PASSWORD);
    await openChat(page, WORKSPACE_ID);
  });

  test("renders a dedicated Sources section (not inline) with cited docs", async ({ page }) => {
    const citations = [
      { id: "11111111-1111-1111-1111-111111111111", title: "Project Architecture", workspace_id: WORKSPACE_ID },
      { id: "22222222-2222-2222-2222-222222222222", title: "Authentication Design", workspace_id: WORKSPACE_ID },
    ];
    await page.route(CHAT_URL, (route) => fulfill(route, sseWithCitations(citations)));

    await page.getByTestId("ai-chat-input").fill("How do we handle failed logins?");
    await page.getByTestId("ai-chat-send").click();

    // Answer text renders, then the Sources section appears below it.
    await expect(page.getByTestId("ai-chat-messages")).toContainText(
      "Based on the docs, here is the answer.",
    );
    const sources = page.getByTestId("ai-chat-sources");
    await expect(sources).toBeVisible();
    await expect(sources).toContainText("Sources");
    await expect(sources).toContainText("Project Architecture");
    await expect(sources).toContainText("Authentication Design");
    // No similarity score / cosine value is ever exposed.
    await expect(sources).not.toContainText("score");
    await expect(sources).not.toContainText("0.");
  });

  test("clicking a source opens the document (chat context preserved)", async ({ page }) => {
    const docId = "33333333-3333-3333-3333-333333333333";
    const citations = [{ id: docId, title: "Sprint Planning Guide", workspace_id: WORKSPACE_ID }];
    await page.route(CHAT_URL, (route) => fulfill(route, sseWithCitations(citations)));

    await page.getByTestId("ai-chat-input").fill("Summarize sprint planning");
    await page.getByTestId("ai-chat-send").click();
    await expect(page.getByTestId("ai-chat-sources")).toBeVisible();

    await page.getByTestId(`ai-chat-source-${docId}`).click();
    // Navigates to the document (fallback for the page-local preview drawer);
    // the global chat panel remains mounted in the workspace layout.
    await page.waitForURL(`**/workspaces/${WORKSPACE_ID}/docs/${docId}`);
    expect(page.url()).toContain(`/workspaces/${WORKSPACE_ID}/docs/${docId}`);
  });

  test("no Sources section when a turn used no semantic sources", async ({ page }) => {
    await page.route(CHAT_URL, (route) =>
      fulfill(
        route,
        "event: start\ndata: {}\n\n" +
          `event: delta\ndata: ${JSON.stringify({ text: "Plain answer." })}\n\n` +
          "event: done\ndata: {}\n\n",
      ),
    );
    await page.getByTestId("ai-chat-input").fill("Hi");
    await page.getByTestId("ai-chat-send").click();
    await expect(page.getByTestId("ai-chat-messages")).toContainText("Plain answer.");
    await expect(page.getByTestId("ai-chat-sources")).toBeHidden();
  });
});

// --------------------------------------------------------------------------- //
// Group B — LIVE semantic retrieval / permission / realtime (env-bound)       //
// --------------------------------------------------------------------------- //
test.describe("semantic search (live)", () => {
  test.skip(!LIVE, "set E2E_LIVE_SEMANTIC=1 with semantic search enabled backend");

  const EMAIL_2 = process.env.E2E_EMAIL_2 ?? "";
  const PASSWORD_2 = process.env.E2E_PASSWORD_2 ?? "";
  // A phrase deliberately NOT present verbatim in the doc, to prove MEANING match.
  const UNIQUE_TOPIC = `zylophone-${Date.now()}`;
  const DOC_TITLE = `Onboarding runbook ${UNIQUE_TOPIC}`;
  const DOC_CONTENT =
    "When a new engineer joins, provision their laptop, create SSO accounts, " +
    "and walk them through the deployment pipeline and on-call rotation.";
  const MEANING_QUERY =
    "What is the process for getting a newly hired developer set up?";

  /** Create a doc via the backend API; returns its id. Triggers DocumentCreated
   *  -> background embedding indexing. */
  async function createDoc(token: string, title: string, content: string): Promise<string> {
    const res = await fetch(`${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/docs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, content }),
    });
    if (!res.ok) throw new Error(`createDoc failed: ${res.status}`);
    return ((await res.json()) as { id: string }).id;
  }

  async function archiveDoc(token: string, docId: string): Promise<void> {
    await fetch(`${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/docs/${docId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /** Send a chat message through the real backend and return the Sources text. */
  async function askAndReadSources(page: Page, question: string): Promise<string> {
    await openChat(page, WORKSPACE_ID);
    await page.getByTestId("ai-chat-input").fill(question);
    await page.getByTestId("ai-chat-send").click();
    // Wait for streaming to settle (Send button returns).
    await expect(page.getByTestId("ai-chat-send")).toBeVisible({ timeout: 60_000 });
    const sources = page.getByTestId("ai-chat-sources");
    return (await sources.count()) > 0 ? (await sources.innerText()) : "";
  }

  test("real semantic retrieval finds a doc by MEANING and cites it", async ({ page }) => {
    const token = await loginAs(page, E2E_EMAIL, E2E_PASSWORD);
    const docId = await createDoc(token, DOC_TITLE, DOC_CONTENT);
    // Give the background indexer time to embed + upsert.
    await page.waitForTimeout(8_000);

    const sourcesText = await askAndReadSources(page, MEANING_QUERY);
    expect(sourcesText).toContain(DOC_TITLE);

    await archiveDoc(token, docId); // cleanup
  });

  test("permission isolation: a non-member is denied another workspace's docs", async ({ browser }) => {
    test.skip(!EMAIL_2 || !PASSWORD_2, "set E2E_EMAIL_2 / E2E_PASSWORD_2");

    // User A (member) creates + indexes a doc in WORKSPACE_ID.
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    const tokenA = await loginAs(pageA, E2E_EMAIL, E2E_PASSWORD);
    const docId = await createDoc(tokenA, DOC_TITLE, DOC_CONTENT);
    await pageA.waitForTimeout(8_000);

    // User B (NOT a member of WORKSPACE_ID) is denied that workspace's docs by
    // the backend — the SAME permission gate (DocsService.list_docs) the
    // semantic tool applies to filter citations, so B can never receive A's doc.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    const tokenB = await loginAs(pageB, EMAIL_2, PASSWORD_2);
    const denied = await pageB.request.get(
      `${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/docs`,
      { headers: { Authorization: `Bearer ${tokenB}` } },
    );
    expect(denied.status()).toBe(403);

    await archiveDoc(tokenA, docId);
    await ctxA.close();
    await ctxB.close();
  });

  test("realtime sync: archived doc drops out of Sources", async ({ page }) => {
    const token = await loginAs(page, E2E_EMAIL, E2E_PASSWORD);
    const docId = await createDoc(token, DOC_TITLE, DOC_CONTENT);
    await page.waitForTimeout(8_000);

    // Present first.
    expect(await askAndReadSources(page, MEANING_QUERY)).toContain(DOC_TITLE);

    // Archive -> DocumentDeleted -> background removes embeddings.
    await archiveDoc(token, docId);
    await page.waitForTimeout(8_000);

    expect(await askAndReadSources(page, MEANING_QUERY)).not.toContain(DOC_TITLE);
  });
});
