import "server-only"

import { cookies } from "next/headers"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME } from "@/lib/auth/cookies"

export class BackendApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = "BackendApiError"
  }
}

function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${serverEnv.apiBaseUrl}${normalizedPath}`
}

function errorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) {
    return fallback
  }

  const detail = payload.detail
  if (typeof detail === "string") {
    return detail
  }

  if (detail && typeof detail === "object" && "message" in detail) {
    return String(detail.message)
  }

  return fallback
}

export async function authenticatedBackendFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (!token) {
    throw new BackendApiError("Not authenticated.", 401)
  }

  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      cache: "no-store",
    })
  } catch {
    throw new BackendApiError("The backend service is unavailable.", 502)
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new BackendApiError(
      errorMessage(payload, `Backend request failed with status ${response.status}.`),
      response.status
    )
  }

  return payload as T
}
