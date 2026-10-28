/**
 * Must live in `src/` beside `src/app`. Next.js resolves middleware from the
 * parent of the app directory and ignores a root `middleware.ts` when `src/app`
 * exists — that left the auth gate unloaded, so anonymous RSC renders treated
 * a failed activations fetch as "every module disabled" and called notFound().
 */
import { trailingSlashTarget } from "@/lib/trailing-slash"
import { siteRedirectFor } from "@/lib/site-redirects"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import {
  DASHBOARD_BASE,
  isDashboardPathname,
  isLegacyAdminPathname,
  legacyAdminToDashboardPath,
} from "@/kernel/paths"
import { DEFAULT_AUTH_COOKIE_NAME, readCookieValue } from "@/lib/auth-cookie"
import { getServerApiBase, internalApiHeaders } from "@/lib/server-api-base"

const LOCALES = ["fa", "en"] as const

type GateData = {
  authenticated?: boolean
  setup_completed?: boolean | null
  password_must_change?: boolean
  /** Dashboard user (non-customer role or admin permission). */
  staff?: boolean
}

function sessionToken(request: NextRequest): string | null {
  const name = process.env.AUTH_COOKIE_NAME?.trim() || DEFAULT_AUTH_COOKIE_NAME
  return (
    readCookieValue(request.headers.get("cookie"), name) ??
    request.cookies.get(name)?.value ??
    null
  )
}

async function fetchGate(request: NextRequest): Promise<GateData | null> {
  const apiBase = getServerApiBase()
  if (!apiBase) return null
  // Do not forward the Cookie header. Middleware fetch (edge/undici) drops
  // Cookie — and Authorization — on a cross-origin redirect, and some
  // runtimes refuse Cookie outright. The gate then always reports
  // authenticated:false and /dashboard 307s back to /login?next=/dashboard
  // after a successful login. Send the session as Bearer; the gate already
  // accepts that (AuthController::resolveAuthenticatedUser).
  const token = sessionToken(request)
  const headers: Record<string, string> = { Accept: "application/json" }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  try {
    const res = await fetch(`${apiBase}/api/v1/auth/gate`, {
      headers,
      cache: "no-store",
      redirect: "manual",
    })
    // A redirect would drop Authorization on the next hop (cross-origin).
    // The internal gate should answer 200 directly.
    if (res.status < 200 || res.status >= 300) return null
    const json = (await res.json()) as { data?: GateData }
    return json.data ?? null
  } catch {
    return null
  }
}

const LINK_HUB_RESERVED = new Set([
  "dashboard",
  "login",
  "setup",
  "account",
  "api",
  "link-hub",
  "_next",
])

/**
 * `/contact` on the primary domain: when no builder page claims it, send visitors to the tenant's
 * contact (link hub) alias, e.g. cafebluedez.ir/contact -> https://contact.cafebluedez.ir/.
 */
async function contactAliasRedirect(request: NextRequest): Promise<string | null> {
  const apiBase = getServerApiBase()
  if (!apiBase) return null
  const host = (request.headers.get("host") || "").replace(/:\d+$/, "").toLowerCase()
  if (!host) return null
  const init = { headers: { Accept: "application/json", ...internalApiHeaders(), "X-Tenant-Domain": host }, cache: "no-store" as const }
  try {
    const page = await fetch(`${apiBase}/api/v1/public/pages/contact`, init)
    if (page.ok) return null
    const res = await fetch(`${apiBase}/api/v1/public/tenant`, init)
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { alias_subdomain?: string; domain_aliases?: string[] } }
    const sub = json.data?.alias_subdomain || "contact"
    const target = `${sub}.${host.replace(/^www\./, "")}`
    return (json.data?.domain_aliases ?? []).map((d) => d.toLowerCase()).includes(target) ? `https://${target}/` : null
  } catch {
    return null
  }
}

/** Per-process TTL memo for public lookups that run on every page request (site-status, host-mode, SEO redirect). */
const MW_TTL_MS = 20_000
const mwMemo = new Map<string, { at: number; value: Promise<unknown> }>()
function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = mwMemo.get(key)
  if (hit && now - hit.at < MW_TTL_MS) return hit.value as Promise<T>
  if (mwMemo.size > 2000) mwMemo.clear()
  const value = load()
  mwMemo.set(key, { at: now, value })
  return value
}

function resolveHostMode(request: NextRequest): Promise<"link-hub" | "primary"> {
  return memo(`hm:${request.headers.get("host") || ""}`, () => resolveHostModeRaw(request))
}

async function resolveHostModeRaw(request: NextRequest): Promise<"link-hub" | "primary"> {
  const apiBase = getServerApiBase()
  if (!apiBase) return "primary"
  try {
    const host = request.headers.get("host") || ""
    const res = await fetch(`${apiBase}/api/v1/public/link-hub/host-mode`, {
      headers: {
        Accept: "application/json",
        ...internalApiHeaders(),
        "X-Tenant-Domain": host.replace(/:\d+$/, ""),
        Host: host,
      },
      cache: "no-store",
    })
    if (!res.ok) return "primary"
    const json = (await res.json()) as { data?: { host_mode?: string } }
    return json.data?.host_mode === "link-hub" ? "link-hub" : "primary"
  } catch {
    return "primary"
  }
}

/** Site lifecycle status (coming_soon / suspended) from the public API; null = active/unknown. */
function fetchSiteStatus(request: NextRequest): Promise<"coming_soon" | "suspended" | null> {
  return memo(`ss:${(request.headers.get("host") || "").toLowerCase()}`, () => fetchSiteStatusRaw(request))
}

async function fetchSiteStatusRaw(request: NextRequest): Promise<"coming_soon" | "suspended" | null> {
  const apiBase = getServerApiBase()
  if (!apiBase) return null
  const host = (request.headers.get("host") || "").replace(/:\d+$/, "").toLowerCase()
  try {
    const res = await fetch(`${apiBase}/api/v1/public/site-status`, {
      headers: { Accept: "application/json", ...internalApiHeaders(), ...(host ? { "X-Tenant-Domain": host } : {}) },
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { status?: string } }
    const st = json.data?.status
    return st === "coming_soon" || st === "suspended" ? st : null
  } catch {
    return null
  }
}

async function handle(request: NextRequest) {
  const { pathname } = request.nextUrl
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-webino-path", `${pathname}${request.nextUrl.search}`)
  // Warm the memoized site-status lookup in parallel with the SEO redirect lookup below.
  if (!pathname.startsWith("/dashboard") && !pathname.startsWith("/site-status")) void fetchSiteStatus(request)

  const cookie =
    request.cookies.get("NEXT_LOCALE")?.value ??
    request.cookies.get("locale")?.value
  const locale =
    cookie && LOCALES.includes(cookie as (typeof LOCALES)[number])
      ? cookie
      : "fa"

  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")

  if (isPublicAsset) {
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    if (!request.cookies.get("NEXT_LOCALE") && locale !== "fa") { // default locale needs no cookie (keeps anonymous responses cacheable)
      res.cookies.set("NEXT_LOCALE", locale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      })
    }
    res.headers.set("x-webina-locale", locale)
    return res
  }

  // On LinkHub alias hosts, serve bio pages instead of the main storefront.
  const isDashboard = isDashboardPathname(pathname)
  const isLogin = pathname === "/login"
  const isSetup = pathname === "/setup"
  const isChangePassword = pathname === "/account/change-password"
  if (!isDashboard && !isLogin && !isSetup && !isChangePassword) {
    const hostMode = await resolveHostMode(request)
    if (hostMode === "link-hub") {
      const segments = pathname.split("/").filter(Boolean)
      const first = segments[0] ?? ""
      if (segments.length === 0 || !LINK_HUB_RESERVED.has(first)) {
        const rewriteUrl = request.nextUrl.clone()
        rewriteUrl.pathname =
          segments.length === 0 ? "/link-hub" : `/link-hub/${segments[0]}`
        requestHeaders.set("x-webino-host-mode", "link-hub")
        const rewriteRes = NextResponse.rewrite(rewriteUrl, {
          request: { headers: requestHeaders },
        })
        if (!request.cookies.get("NEXT_LOCALE") && locale !== "fa") { // default locale needs no cookie (keeps anonymous responses cacheable)
          rewriteRes.cookies.set("NEXT_LOCALE", locale, {
            path: "/",
            maxAge: 60 * 60 * 24 * 365,
          })
        }
        rewriteRes.headers.set("x-webina-locale", locale)
        rewriteRes.headers.set("x-webino-host-mode", "link-hub")
        return rewriteRes
      }
    } else if (pathname === "/contact") {
      const target = await contactAliasRedirect(request)
      if (target) return NextResponse.redirect(target, 308)
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  if (!request.cookies.get("NEXT_LOCALE") && locale !== "fa") { // default locale needs no cookie (keeps anonymous responses cacheable)
    res.cookies.set("NEXT_LOCALE", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  res.headers.set("x-webina-locale", locale)

  const torobClid = request.nextUrl.searchParams.get("torob_clid")?.trim()
  if (torobClid && /^[A-Za-z0-9_-]{1,128}$/.test(torobClid)) {
    res.cookies.set("torob_clid", torobClid, {
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    })
  }

  // Code-level public 301s (SITE_REDIRECTS; default alikhabari /about → /about-poet — alikhabari is served by this frontend).
  if (!pathname.startsWith("/dashboard") && !pathname.startsWith("/api") && !pathname.includes(".")) {
    const siteHost = (request.headers.get("host") || "").replace(/:\d+$/, "").toLowerCase()
    const to = siteRedirectFor(siteHost, pathname)
    if (to) return new NextResponse(null, { status: 301, headers: { Location: to } })
  }

  // Native SEO redirects (no Rank Math)
  if (
    !pathname.startsWith("/dashboard") &&
    pathname !== "/login" &&
    pathname !== "/setup" &&
    pathname !== "/account/change-password"
  ) {
    try {
      const apiBase = getServerApiBase()
      if (apiBase) {
        const host = (request.headers.get("host") || "").replace(/:\d+$/, "").toLowerCase()
        const json = await memo(`rd:${host}:${pathname}`, async () => {
          const lookup = await fetch(
            `${apiBase}/api/v1/public/seo/redirect?path=${encodeURIComponent(pathname)}`,
            { headers: { Accept: "application/json", ...internalApiHeaders(), ...(host ? { "X-Tenant-Domain": host } : {}) }, cache: "no-store" },
          )
          return lookup.ok ? ((await lookup.json()) as { data?: { to_path?: string; status_code?: number } | null }) : null
        })
        if (json) {
          const to = json.data?.to_path
          const code = Number(json.data?.status_code ?? 301)
          if (to && to !== pathname) {
            const url = request.nextUrl.clone()
            url.pathname = to
            return NextResponse.redirect(
              url,
              [301, 302, 307, 308].includes(code) ? (code as 301 | 302 | 307 | 308) : 301,
            )
          }
        }
      }
    } catch {
      /* ignore redirect lookup failures */
    }
  }

  // WordPress-style trailing slash (/shop/, /about/) → one 301 to the slashless canonical (Next's own 308 is disabled).
  // Location comes from the raw URL: a cloned nextUrl re-adds the slash (skipTrailingSlashRedirect) → self-redirect loop.
  if (pathname.length > 1 && pathname.endsWith("/") && !pathname.startsWith("/wp-json")) {
    return new NextResponse(null, { status: 301, headers: { Location: trailingSlashTarget(request.url) } })
  }

  // Legacy /admin → /dashboard (bookmarks & old links)
  if (isLegacyAdminPathname(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = legacyAdminToDashboardPath(pathname)
    return NextResponse.redirect(url)
  }

  if (
    !isDashboard &&
    !isLogin &&
    !isSetup &&
    !isChangePassword &&
    !pathname.startsWith("/site-status")
  ) {
    const siteStatus = await fetchSiteStatus(request)
    // Staff (dashboard users only, not customers) keep seeing the real site while it is "coming soon"; suspension blocks everyone.
    const bypass = siteStatus === "coming_soon" && sessionToken(request) && (await fetchGate(request))?.staff === true
    if (siteStatus && !bypass) {
      const url = request.nextUrl.clone()
      url.pathname = `/site-status/${siteStatus === "suspended" ? "suspended" : "coming-soon"}`
      url.search = ""
      const rw = NextResponse.rewrite(url, {
        request: { headers: requestHeaders },
        status: siteStatus === "suspended" ? 503 : 200,
      })
      rw.headers.set("Cache-Control", "no-store")
      if (siteStatus === "suspended") {
        rw.headers.set("X-Robots-Tag", "noindex, nofollow")
        rw.headers.set("Retry-After", "86400")
      }
      return rw
    }
  }

  if (isDashboard || isSetup || isChangePassword) {
    const gate = await fetchGate(request)
    if (!gate?.authenticated) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = "/login"
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (gate.password_must_change && !isChangePassword) {
      const changeUrl = request.nextUrl.clone()
      changeUrl.pathname = "/account/change-password"
      changeUrl.search = ""
      return NextResponse.redirect(changeUrl)
    }
    if (!gate.password_must_change && isChangePassword) {
      const dest = gate.setup_completed === false ? "/setup" : DASHBOARD_BASE
      const url = request.nextUrl.clone()
      url.pathname = dest
      return NextResponse.redirect(url)
    }
    if (gate.setup_completed === false && !isSetup && !isChangePassword) {
      const setupUrl = request.nextUrl.clone()
      setupUrl.pathname = "/setup"
      return NextResponse.redirect(setupUrl)
    }
    if (gate.setup_completed !== false && isSetup) {
      const dashUrl = request.nextUrl.clone()
      dashUrl.pathname = DASHBOARD_BASE
      return NextResponse.redirect(dashUrl)
    }
  }

  if (isLogin) {
    const gate = await fetchGate(request)
    if (gate?.authenticated) {
      if (gate.password_must_change) {
        const changeUrl = request.nextUrl.clone()
        changeUrl.pathname = "/account/change-password"
        changeUrl.search = ""
        return NextResponse.redirect(changeUrl)
      }
      const rawNext = request.nextUrl.searchParams.get("next")
      const nextPath =
        rawNext && rawNext.startsWith("/")
          ? legacyAdminToDashboardPath(rawNext)
          : DASHBOARD_BASE
      const dest = gate.setup_completed === false ? "/setup" : nextPath
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = dest.startsWith("/") ? dest : DASHBOARD_BASE
      redirectUrl.search = ""
      return NextResponse.redirect(redirectUrl)
    }
  }

  return res
}

/** Wraps every middleware response with the harmless site marker cookie (not an auth cookie). */
/**
 * Next's optimizer fetches relative `/_next/image?url=/storage/..` from itself, where storage/uploads
 * are not served (400 "isn't a valid image"). Point it at the backend origin instead; host-independent,
 * so it works for every tenant. Requires the http/https `/storage|/uploads` remotePatterns in next.config.
 */
function rewriteImageOptimizerSource(request: NextRequest): NextResponse | null {
  const src = request.nextUrl.searchParams.get("url") || ""
  if (!/^\/(storage|uploads)\//.test(src)) return null
  const base = getServerApiBase().replace(/\/+$/, "").replace(/\/api(\/v1)?$/, "")
  if (!/^https?:\/\//.test(base)) return null
  const next = request.nextUrl.clone()
  next.searchParams.set("url", `${base}${src}`)
  return NextResponse.rewrite(next)
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/_next/image") return rewriteImageOptimizerSource(request) ?? NextResponse.next()
  const res = await handle(request)
  if (res && !request.cookies.get("webina_site")) {
    res.cookies.set("webina_site", "dashboard", { path: "/", sameSite: "lax", maxAge: 31536000 })
  }
  return res
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)", "/_next/image"],
}
