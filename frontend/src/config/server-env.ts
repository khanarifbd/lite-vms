import "server-only"

const PRODUCTION_WEB_ORIGIN = "http://169.58.86.147"
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"])

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")

function resolvePublicWebOrigin() {
  const configured =
    process.env.PUBLIC_WEB_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || ""

  if (configured) {
    try {
      const parsed = new URL(configured)
      if (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        !LOCAL_HOSTNAMES.has(parsed.hostname)
      ) {
        return stripTrailingSlash(configured)
      }
    } catch {
      // Fall through to the production website origin.
    }
  }

  return PRODUCTION_WEB_ORIGIN
}

export const serverEnv = Object.freeze({
  apiBaseUrl: stripTrailingSlash(
    process.env.API_BASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
      "http://127.0.0.1:8000/api/v1"
  ),
  publicWebOrigin: resolvePublicWebOrigin(),
})
