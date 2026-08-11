import type { LoginResult, SessionResult } from "@/lib/auth/types"

export class AuthApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = "AuthApiError"
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "Authentication request failed."
    throw new AuthApiError(message, response.status)
  }

  return payload as T
}

export async function loginUser(input: {
  identifier: string
  password: string
  rememberMe: boolean
}) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  return parseResponse<LoginResult>(response)
}

export async function registerVtsApplicant(input: {
  fullName: string
  email: string
  mobile: string
  password: string
  confirmPassword: string
}) {
  const response = await fetch("/api/auth/register/vts-provider", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  return parseResponse<LoginResult>(response)
}

export async function registerVehicleOwnerApplicant(input: {
  ownerType: "individual" | "company"
  fullName: string
  mobile: string
  password: string
  confirmPassword: string
}) {
  const response = await fetch("/api/auth/register/vehicle-owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  return parseResponse<LoginResult>(response)
}

export async function registerDriverApplicant(input: {
  fullName: string
  email?: string
  mobile: string
  password: string
  confirmPassword: string
  licenceNumber: string
  licenceType: "professional" | "non_professional" | "learner"
  licenceExpiryDate: string
}) {
  const response = await fetch("/api/auth/register/driver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  return parseResponse<LoginResult>(response)
}

export async function logoutUser() {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
  })

  return parseResponse<{ message: string }>(response)
}

export async function getSession() {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
  })

  return parseResponse<SessionResult>(response)
}

export async function changePassword(input: {
  currentPassword: string
  newPassword: string
}) {
  const response = await fetch("/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })

  return parseResponse<{ message: string }>(response)
}
