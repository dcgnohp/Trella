/**
 * Configures the generated API client (`lib/client/`).
 *
 * Responsibilities (Requirements 16.2, 16.4, 17.4):
 *  - Read the backend base URL from `NEXT_PUBLIC_API_URL`.
 *  - Attach the JWT Bearer token (read from the httpOnly cookie on the server)
 *    to every outgoing request via a request interceptor.
 *
 * The token source is intentionally *pluggable*: the real cookie-reading helper
 * lives in `lib/auth.ts` (task 21.1). Until that exists, the default provider
 * returns `undefined` (no Authorization header). Wire the real provider in via
 * `setAuthTokenProvider(...)` once `lib/auth.ts` lands.
 */
import type { AxiosRequestConfig } from "axios"

import { OpenAPI } from "./client"

/** Fallback base URL when `NEXT_PUBLIC_API_URL` is not set. */
const DEFAULT_API_URL = "http://localhost:8000"

/** Backend base URL, configurable via env (see `.env.example`). */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL

/**
 * A pluggable source for the auth token. Resolves to the raw JWT (no `Bearer `
 * prefix) or a nullish value when there is no authenticated session.
 *
 * Implemented on the server side by reading the httpOnly auth cookie.
 */
export type AuthTokenProvider = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>

/**
 * Default provider used until `lib/auth.ts` (task 21.1) supplies the real
 * cookie reader.
 *
 * TODO(21.1): replace this default by calling `setAuthTokenProvider(getAuthToken)`
 * where `getAuthToken` comes from `lib/auth.ts` and reads the JWT from the
 * httpOnly cookie via `next/headers` `cookies()`.
 */
const defaultAuthTokenProvider: AuthTokenProvider = () => undefined

let authTokenProvider: AuthTokenProvider = defaultAuthTokenProvider

/**
 * Override the token source. Call this once (e.g. from `lib/auth.ts`, task 21.1)
 * to plug in server-side cookie reading.
 */
export function setAuthTokenProvider(provider: AuthTokenProvider): void {
  authTokenProvider = provider
}

let configured = false

/**
 * Apply base URL + auth interceptor to the generated client. Idempotent.
 *
 * Runs automatically on module import, but is exported so callers can re-run it
 * after changing configuration (or in tests).
 */
export function configureClient(): void {
  OpenAPI.BASE = API_BASE_URL

  // We attach the Authorization header ourselves; do not also send cookies.
  OpenAPI.WITH_CREDENTIALS = false
  OpenAPI.CREDENTIALS = "omit"

  if (configured) {
    return
  }
  configured = true

  // Request interceptor: attach Bearer token from the pluggable source.
  OpenAPI.interceptors.request.use(async (config: AxiosRequestConfig) => {
    const token = await authTokenProvider()
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      }
    }
    return config
  })
}

// Configure on import so simply importing the client applies the settings.
configureClient()
