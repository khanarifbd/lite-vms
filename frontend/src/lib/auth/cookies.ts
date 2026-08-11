export const AUTH_COOKIE_NAME = "bnvt_access_token"

const secureCookie =
  process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase() === "true" ||
  (process.env.AUTH_COOKIE_SECURE == null && process.env.NODE_ENV === "production")

export const authCookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: secureCookie,
  path: "/",
}
