const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")

export const env = Object.freeze({
  appName:
    process.env.NEXT_PUBLIC_APP_NAME?.trim() ||
    "AutoGeneration LTD CMS Portal",
  apiBaseUrl: stripTrailingSlash(
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
      "http://127.0.0.1:8000/api/v1"
  ),
  wsBaseUrl: stripTrailingSlash(
    process.env.NEXT_PUBLIC_WS_BASE_URL?.trim() || "ws://127.0.0.1:8000"
  ),
})
