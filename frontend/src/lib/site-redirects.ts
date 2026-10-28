/**
 * Env-configurable 301s for public site paths (ERP has no SEO-redirect table).
 * SITE_REDIRECTS="host:/from=/to,/from2=/to2" — host is optional (applies to every host when omitted).
 * Default: alikhabari.ir /about → /about-poet.
 */
const DEFAULT_SITE_REDIRECTS = "alikhabari.ir:/about=/about-poet,www.alikhabari.ir:/about=/about-poet"

export type SiteRedirect = { host: string; from: string; to: string }

export function parseSiteRedirects(raw: string | undefined = process.env.SITE_REDIRECTS): SiteRedirect[] {
  const src = raw ?? DEFAULT_SITE_REDIRECTS
  const out: SiteRedirect[] = []
  for (const part of src.split(",")) {
    const m = /^\s*(?:([a-z0-9.-]+):)?(\/[^=\s]*)=(\/[^\s]*)\s*$/i.exec(part)
    if (m && m[2] !== m[3]) out.push({ host: (m[1] ?? "").toLowerCase(), from: m[2].replace(/\/+$/, "") || "/", to: m[3] })
  }
  return out
}

/** Safe multi-pass percent-decode + NFC, so "/%D8%A8" and "/ب" compare equal. Never throws. */
export function normalizeRedirectPath(path: string): string {
  let out = path
  for (let i = 0; i < 3 && out.includes("%"); i++) {
    try {
      const next = decodeURIComponent(out)
      if (next === out) break
      out = next
    } catch {
      break
    }
  }
  return (out.normalize("NFC").replace(/\/+$/, "") || "/")
}

export function siteRedirectFor(host: string, pathname: string, rules = parseSiteRedirects()): string | null {
  const path = normalizeRedirectPath(pathname)
  const h = host.toLowerCase()
  return rules.find((r) => normalizeRedirectPath(r.from) === path && (!r.host || r.host === h))?.to ?? null
}
