import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import {
  DASHBOARD_BASE,
  isDashboardPathname,
  isLegacyAdminPathname,
  legacyAdminToDashboardPath,
} from "@/kernel/paths"
import { getServerApiBase } from "@/lib/server-api-base"

const LOCALES = ["fa", "en"] as const

type GateData = {
  authenticated?: boolean
  setup_completed?: boolean | null
  password_must_change?: boolean
}

async function fetchGate(request: NextRequest): Promise<GateData | null> {
  const apiBase = getServerApiBase()
  if (!apiBase) return null
  try {
    const res = await fetch(`${apiBase}/api/v1/auth/gate`, {
      headers: {
        Accept: "application/json",
        Cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: GateData }
    return json.data ?? null
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const res = NextResponse.next()

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
