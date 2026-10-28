/**
 * Edge nginx cache purge, fired after on-demand revalidation (Next's revalidateTag/Path never reaches
 * the edge `proxy_cache pages`). Disabled unless EDGE_PURGE_URL is set. See docs/cache-headers.md.
 *
 *   EDGE_PURGE_URL     base URL of the purge endpoint, e.g. http://edge:8080/purge  (path is appended)
 *   EDGE_PURGE_METHOD  HTTP method, default PURGE (ngx_cache_purge); use GET/POST for a custom endpoint
 *   EDGE_PURGE_SECRET  optional, sent as `x-purge-secret`
 *   EDGE_PURGE_ALL     path purged when only tags were revalidated, default "/*" (wildcard purge)
 */
export async function purgeEdge(paths: string[], host?: string): Promise<{ purged: number; failed: number } | null> {
  const base = process.env.EDGE_PURGE_URL?.replace(/\/+$/, "")
  if (!base) return null
  const method = (process.env.EDGE_PURGE_METHOD || "PURGE").toUpperCase()
  const targets = paths.length ? paths : [process.env.EDGE_PURGE_ALL || "/*"]
  const headers: Record<string, string> = {}
  if (process.env.EDGE_PURGE_SECRET) headers["x-purge-secret"] = process.env.EDGE_PURGE_SECRET
  if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) headers["x-purge-host"] = host.toLowerCase()
  let purged = 0
  let failed = 0
  await Promise.all(
    targets.map(async (p) => {
      // Purge both spellings of Persian paths: nginx keys on the raw (percent-encoded) request URI.
      const encoded = p.split("/").map((s) => (s === "*" ? s : encodeURIComponent(safeDecode(s)))).join("/")
      for (const variant of Array.from(new Set([encoded]))) {
        try {
          const res = await fetch(`${base}${variant}`, { method, headers, cache: "no-store", signal: AbortSignal.timeout(3000) })
          if (res.ok || res.status === 404) purged++
          else failed++
        } catch {
          failed++
        }
      }
    }),
  )
  return { purged, failed }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
