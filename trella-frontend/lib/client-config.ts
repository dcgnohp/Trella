import type { AxiosRequestConfig } from "axios"

import { OpenAPI } from "./client"

const DEFAULT_API_URL = "http://localhost:8000"

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL

/**
 * A pluggable source for the auth token. Resolves to the raw JWT (no `Bearer `
 * prefix) or a nullish value when there is no authenticated session.
 */
export type AuthTokenProvider = () =>
  | string
  | null
  | undefined
  | Promise<string | null | undefined>

const defaultAuthTokenProvider: AuthTokenProvider = () => undefined

let authTokenProvider: AuthTokenProvider = defaultAuthTokenProvider

/** Override the token source to plug in server-side cookie reading. */
export function setAuthTokenProvider(provider: AuthTokenProvider): void {
  authTokenProvider = provider
}

let configured = false

/** Apply base URL + auth interceptor to the generated client. Idempotent. */
export function configureClient(): void {
  OpenAPI.BASE = API_BASE_URL

  // We attach the Authorization header ourselves; do not also send cookies.
  OpenAPI.WITH_CREDENTIALS = false
  OpenAPI.CREDENTIALS = "omit"

  if (configured) {
    return
  }
  configured = true

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

configureClient()
