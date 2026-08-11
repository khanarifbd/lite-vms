import "server-only"

import { cookies } from "next/headers"

import { serverEnv } from "@/config/server-env"
import { AUTH_COOKIE_NAME } from "@/lib/auth/cookies"
import type { AuthUser } from "@/lib/auth/types"

export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value

  if (!token) {
    return null
  }

  try {
    const response = await fetch(`${serverEnv.apiBaseUrl}/auth/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    })

    if (!response.ok) {
      return null
    }

    return (await response.json()) as AuthUser
  } catch {
    return null
  }
}
