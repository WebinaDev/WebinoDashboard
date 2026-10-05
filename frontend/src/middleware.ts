/**
 * Must live in `src/` beside `src/app`. Next.js resolves middleware from the
 * parent of the app directory and ignores a root `middleware.ts` when `src/app`
 * exists — that left the auth gate unloaded, so anonymous RSC renders treated
 * a failed activations fetch as "every module disabled" and called notFound().
 */
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import {
  DASHBOARD_BASE,
  isDashboardPathname,
  isLegacyAdminPathname,
  legacyAdminToDashboardPath,
} from "@/kernel/paths"
import { DEFAULT_AUTH_COOKIE_NAME, readCookieValue } from "@/lib/auth-cookie"
import { getServerApiBase } from "@/lib/server-api-base"

const LOCALES = ["fa", "en"] as const

type GateData = {
  authenticated?: boolean
  setup_completed?: boolean | null
  password_must_change?: boolean
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-webino-path", `${pathname}${request.nextUrl.search}`)
  const res = NextResponse.next({ request: { headers: requestHeaders } })

  const cookie =
    request.cookies.get("NEXT_LOCALE")?.value ??
    request.cookies.get("locale")?.value
  const locale =
    cookie && LOCALES.includes(cookie as (typeof LOCALES)[number])
      ? cookie
      : "fa"
  if (!request.cookies.get("NEXT_LOCALE")) {
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

  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")

  if (isPublicAsset) {
    return res
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
        const lookup = await fetch(
          `${apiBase}/api/v1/public/seo/redirect?path=${encodeURIComponent(pathname)}`,
          { headers: { Accept: "application/json" }, cache: "no-store" },
        )
        if (lookup.ok) {
          const json = (await lookup.json()) as {
            data?: { to_path?: string; status_code?: number } | null
          }
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

  // Legacy /admin → /dashboard (bookmarks & old links)
  if (isLegacyAdminPathname(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = legacyAdminToDashboardPath(pathname)
    return NextResponse.redirect(url)
  }

  const isLogin = pathname === "/login"
  const isSetup = pathname === "/setup"
  const isChangePassword = pathname === "/account/change-password"
  const isDashboard = isDashboardPathname(pathname)

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

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
}
