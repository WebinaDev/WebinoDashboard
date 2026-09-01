import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const LOCALES = ["fa", "en"] as const
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""

async function fetchGate(request: NextRequest) {
  if (!API_BASE) return null
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/gate`, {
      headers: {
        Accept: "application/json",
        Cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { authenticated?: boolean; setup_completed?: boolean | null } }
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

  const isLogin = pathname === "/login"
  const isSetup = pathname === "/setup"
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/")
  const isPublicAsset =
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")

  if (isPublicAsset) {
    return res
  }

  if (isAdmin || isSetup) {
    const gate = await fetchGate(request)
    if (!gate?.authenticated) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = "/login"
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (gate.setup_completed === false && !isSetup) {
      const setupUrl = request.nextUrl.clone()
      setupUrl.pathname = "/setup"
      return NextResponse.redirect(setupUrl)
    }
    if (gate.setup_completed !== false && isSetup) {
      const adminUrl = request.nextUrl.clone()
      adminUrl.pathname = "/admin"
      return NextResponse.redirect(adminUrl)
    }
  }

  if (isLogin) {
    const gate = await fetchGate(request)
    if (gate?.authenticated) {
      const dest = request.nextUrl.searchParams.get("next") ?? "/admin"
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = dest
      redirectUrl.search = ""
      return NextResponse.redirect(redirectUrl)
    }
  }

  return res
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
}
