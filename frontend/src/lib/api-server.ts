import { cache } from "react"
import { cookies, headers as nextHeaders } from "next/headers"

import { unwrapApiData } from "@webina/ui"

import { getServerApiBase } from "@/lib/server-api-base"

type FetchOptions = RequestInit & { revalidate?: number | false; tags?: string[] }

/** Non-404 HTTP failure from the API (5xx, 429, ...). Thrown only by apiServerStrict. */
export class ApiTransientError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = "ApiTransientError"
  }
}

/** Page/data cache is on by default; WEBINO_PAGE_CACHE=off disables caching of public reads. */
const PAGE_CACHE_OFF = (process.env.WEBINO_PAGE_CACHE ?? "").toLowerCase() === "off"
/** Per-visitor data is never cached, whatever the caller asked for. */
const NEVER_CACHE = /\/(cart|checkout|account|my-account|register|login|auth|orders|me|wishlist)(\/|\?|$)/

async function serverFetch(path: string, rawInit?: FetchOptions, strict = false): Promise<unknown | null> {
  const init: FetchOptions | undefined =
    PAGE_CACHE_OFF || NEVER_CACHE.test(path) ? { ...rawInit, revalidate: false } : rawInit
  const apiBase = getServerApiBase()
  if (!apiBase) {
    return null
  }

  const jar = await cookies()
  // Cached public reads must not carry per-visitor cookies: they are part of the Next data-cache key,
  // so forwarding laravel_session/XSRF/NEXT_LOCALE made every visitor a cache miss (full API round-trip per request).
  const sharedPublic = init?.revalidate !== false && init?.revalidate !== 0 && path.startsWith("/api/v1/public/")
  const cookieHeader = sharedPublic ? "" : jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ")

  let tenantHost = ""
  try {
    const h = await nextHeaders()
    tenantHost = (h.get("x-forwarded-host") || h.get("host") || "").replace(/:\d+$/, "")
  } catch {
    /* headers() unavailable outside a request */
  }

  const revalidate = init?.revalidate
  const nextOpts =
    revalidate === false
      ? { cache: "no-store" as const }
      : {
          next: {
            revalidate: typeof revalidate === "number" ? revalidate : 60,
            tags: init?.tags,
          },
        }

  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    ...nextOpts,
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(tenantHost ? { "X-Tenant-Domain": tenantHost } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    if (strict && res.status !== 404) throw new ApiTransientError(`HTTP ${res.status} from ${path}`, res.status)
    return null
  }

  const text = await res.text()
  if (!text) {
    return null
  }

  return JSON.parse(text) as unknown
}

/** Raw JSON response (public site RSC pages). */
export async function apiServer<T>(path: string, opts?: FetchOptions): Promise<T | null> {
  try {
    return (await serverFetch(path, opts)) as T | null
  } catch {
    return null
  }
}

/**
 * Like apiServer, but only a real HTTP 404 (or no API configured) yields null. Network errors and
 * 5xx rethrow, so a valid route never renders (and ISR/edge never caches) a 404 while the backend
 * restarts: Next keeps serving the last good page instead. Parity with ERP 2624dbe.
 */
export async function apiServerStrict<T>(path: string, opts?: FetchOptions): Promise<T | null> {
  // During `next build` the backend is usually unreachable: keep the lenient behaviour there.
  if (process.env.NEXT_PHASE === "phase-production-build") return apiServer<T>(path, opts)
  return (await serverFetch(path, opts, true)) as T | null
}

/** Unwrapped API `data` payload (authenticated dashboard home). */
export const apiServerData = cache(async <T,>(path: string, opts?: FetchOptions): Promise<T | null> => {
  const raw = await apiServer<unknown>(path, opts)
  if (raw == null) {
    return null
  }
  return unwrapApiData<T>(raw)
})

export async function getPublicTenant(): Promise<{
  data: { name: string; store_display_name?: string | null; active_theme_slug?: string | null }
}> {
  const res = await apiServer<{
    data: { name: string; store_display_name?: string | null; active_theme_slug?: string | null }
  }>("/api/v1/public/tenant", { revalidate: 60, tags: ["tenant"] })
  if (!res) {
    throw new Error("tenant unavailable")
  }
  return res
}
