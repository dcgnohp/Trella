import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 1 — AI Content Generation end-to-end flow.
 *
 * Covers: open Task Detail Drawer -> Generate Description -> Apply -> edit ->
 * Save -> Generate Summary -> retry after error -> loading & empty states.
 *
 * The two AI endpoints are mocked via route interception so this test needs NO
 * live OpenAI key and is deterministic. It exercises the real frontend
 * components + drawer wiring.
 *
 * SETUP (app-specific — fill in for your environment):
 *  - BASE_URL points at a running frontend (default http://localhost:3000).
 *  - `login(page)` must establish an authenticated session (cookie).
 *  - `openFirstTask(page)` must navigate to a board and open a task's drawer.
 * Everything after the drawer is open is driven by stable testIds added to the
 * AI components.
 */

const GENERATE_URL = "**/api/v1/ai/tasks/generate-description";
const SUMMARIZE_URL = "**/api/v1/ai/tasks/summarize";

const DESCRIPTION_RESULT = {
  description: "Implement a secure OAuth login page.",
  acceptanceCriteria: ["User can sign in with Google", "Invalid logins are rejected"],
  technicalNotes: ["Reuse existing auth service"],
  definitionOfDone: ["Merged, tested, and deployed"],
};

const SUMMARY_RESULT = {
  summary: "Build the OAuth login flow.",
  risks: ["Auth provider not finalized"],
  actionItems: ["Wire up the OAuth callback"],
};

// TODO(env): implement against your auth + navigation.
async function login(page: Page): Promise<void> {
  // e.g. set the access_token cookie or drive the login form.
  throw new Error("login(page) not implemented for this environment");
}

// TODO(env): open a task so the Task Detail Drawer is visible.
async function openFirstTask(page: Page): Promise<void> {
  throw new Error("openFirstTask(page) not implemented for this environment");
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await openFirstTask(page);
});

test("generate description -> apply -> edit -> save", async ({ page }) => {
  // Slow the response so the loading state is observable.
  await page.route(GENERATE_URL, async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ json: DESCRIPTION_RESULT });
  });

  await page.getByTestId("ai-desc-generate").click();

  // Loading state (spinner) then the editable draft.
  await expect(page.getByText(/Thinking/i)).toBeVisible();
  const textarea = page.getByLabel("Generated description");
  await expect(textarea).toBeVisible();
  await expect(textarea).toContainText("secure OAuth login");

  // Edit the generated content before applying.
  await textarea.fill("Edited description before save.");

  // Apply only populates the editor + enters edit mode; it must NOT save.
  await page.getByTestId("ai-desc-apply").click();
  await expect(page.getByText("Edited description before save.")).toBeVisible();
  // The Save/Cancel buttons of the editor are visible (edit mode), proving
  // Apply did not auto-save.
  const saveBtn = page.getByRole("button", { name: "Save" });
  await expect(saveBtn).toBeVisible();

  // User explicitly saves.
  await saveBtn.click();
  await expect(saveBtn).toBeHidden();
});

test("generate summary -> retry after error -> success", async ({ page }) => {
  let calls = 0;
  await page.route(SUMMARIZE_URL, async (route) => {
    calls += 1;
    if (calls === 1) {
      await route.fulfill({
        status: 503,
        json: { detail: { code: "provider_unavailable", message: "AI is down" } },
      });
    } else {
      await route.fulfill({ json: SUMMARY_RESULT });
    }
  });

  await page.getByTestId("ai-summary-generate").click();

  // First attempt errors -> error card + retry.
  await expect(page.getByText(/Something went wrong/i)).toBeVisible();
  await page.getByRole("button", { name: "Retry" }).click();

  // Retry succeeds -> summary + derived lists.
  await expect(page.getByText("Build the OAuth login flow.")).toBeVisible();
  await expect(page.getByText("Auth provider not finalized")).toBeVisible();
  await expect(page.getByText("Wire up the OAuth callback")).toBeVisible();
});

test("summary empty state disables the action", async ({ page }) => {
  // With no description on the task, the Summarize button is disabled and the
  // hint is shown. (Requires opening a task with an empty description.)
  await expect(page.getByTestId("ai-summary-generate")).toBeDisabled();
  await expect(
    page.getByText("Add a description to generate a summary."),
  ).toBeVisible();
});
