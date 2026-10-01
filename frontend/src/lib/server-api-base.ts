/**
 * Server/middleware API origin. Never return a relative `/api` — Edge fetch needs an absolute URL.
 *
 * ERP tenant containers sit on both their private net and `webino_sites`. On that
 * shared network the short name `backend` is the ERP API, so a Sanctum token from
 * the tenant cookie never authenticates. When `WEBINO_SITE_SLUG` is set, replace
 * that generic host with `ws-{slug}-backend`.
 */
export function getServerApiBase(): string {
  return resolveServerApiBase({
    internalApiUrl: process.env.INTERNAL_API_URL,
    siteSlug: process.env.WEBINO_SITE_SLUG,
    publicApiUrl: process.env.NEXT_PUBLIC_API_URL,
  })
}

export function resolveServerApiBase(input: {
  internalApiUrl?: string | null
  siteSlug?: string | null
  publicApiUrl?: string | null
}): string {
  const internal = absoluteBase(input.internalApiUrl)
  const slug = siteSlug(input.siteSlug)
  if (slug && (!internal || isAmbiguousBackend(internal))) {
    return `http://ws-${slug}-backend:8080`
  }
  if (internal) return internal
  return absoluteBase(input.publicApiUrl)
}

function absoluteBase(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? ""
  if (!/^https?:\/\//i.test(trimmed)) return ""
  return trimmed.replace(/\/$/, "").replace(/\/api$/i, "")
}

function siteSlug(value: string | null | undefined): string | null {
  const slug = value?.trim().toLowerCase() ?? ""
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return null
  return slug
}

function isAmbiguousBackend(base: string): boolean {
  try {
    return new URL(base).hostname === "backend"
  } catch {
    return false
  }
}
