/**
 * Location for the WordPress-style trailing-slash 301 (/shop/ → /shop).
 * Built from the raw request URL, not request.nextUrl: with skipTrailingSlashRedirect the
 * NextURL remembers the original trailing slash and re-adds it, which made the 301 point to itself.
 * Relative, so the proxy's internal host never leaks into Location.
 */
export function trailingSlashTarget(requestUrl: string): string {
  const u = new URL(requestUrl, "http://localhost")
  return (u.pathname.replace(/\/+$/, "") || "/") + u.search
}
