import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { defineConfig } from "@playwright/test"

// Load trella-frontend/.env into process.env (Playwright doesn't do this like
// Next does). Shell-provided vars take precedence. Minimal parser, no new dep.
const envPath = resolve(__dirname, ".env")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

/**
 * Playwright config for the AI content-generation E2E.
 *
 * Requires a running frontend (default http://localhost:3000) AND backend
 * (default http://localhost:8000). Override via E2E_BASE_URL / E2E_API_URL.
 * The AI endpoints are mocked inside the spec, so no OpenAI/Gemini key is
 * needed — but a real logged-in session + an existing task are required.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
})
