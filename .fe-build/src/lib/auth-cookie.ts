/** Must match backend `AUTH_COOKIE_NAME` (compose default). */
export const DEFAULT_AUTH_COOKIE_NAME = "webino_auth_token"

/**
 * Read one cookie from a raw `Cookie` header.
 * Sanctum session values look like `1|plainText` — split on the first `=`
 * only, and decode `%7C` back to `|` so the token is intact.
 */
export function readCookieValue(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader || !name) return null
  for (const part of cookieHeader.split(";")) {
    const splitAt = part.indexOf("=")
    if (splitAt === -1) continue
    const key = part.slice(0, splitAt).trim()
    if (key !== name) continue
    const raw = part.slice(splitAt + 1).trim()
    if (!raw) return null
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}
