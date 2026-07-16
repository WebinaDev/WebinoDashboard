import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const LOCALES = ["fa", "en"] as const

export function middleware(request: NextRequest) {
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
  return res
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
}
