import { NextResponse, type NextRequest } from "next/server"

const AUTH_COOKIE = process.env.AUTH_COOKIE_NAME ?? "webino_auth_token"

const PUBLIC_EXACT = new Set(["/login", "/consultation"])
const PUBLIC_PREFIXES = [
  "/blog",
  "/academy",
  "/portfolio",
  "/team",
  "/announcements",
  "/testimonials",
  "/pages",
]

function getInternalApiBase(): string {
  return process.env.INTERNAL_API_URL ?? "http://localhost:8080"
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") {
    return true
  }
  if (PUBLIC_EXACT.has(pathname)) {
    return true
  }
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/")
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get(AUTH_COOKIE)?.value
  if (!cookie) {
    return false
  }

  try {
    const res = await fetch(`${getInternalApiBase()}/api/v1/auth/gate`, {
      headers: {
        Cookie: request.headers.get("cookie") ?? "",
        Accept: "application/json",
      },
      cache: "no-store",
    })
    if (!res.ok) {
      return false
    }
    const body = (await res.json()) as { data?: { authenticated?: boolean } }
    return body.data?.authenticated === true
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const authed = await isAuthenticated(request)

  if (pathname === "/login") {
    if (authed) {
      return NextResponse.redirect(new URL("/admin", request.url))
    }
    return NextResponse.next()
  }

  if (isPublicPath(pathname) && !isAdminPath(pathname)) {
    return NextResponse.next()
  }

  if (isAdminPath(pathname) || pathname === "/setup") {
    if (!authed) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("from", pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // Legacy dashboard paths → /admin
  const legacy = [
    "/catalog",
    "/orders",
    "/cart",
    "/checkout",
    "/users",
    "/store-settings",
    "/modules",
    "/inventory",
    "/reports",
    "/marketing",
    "/cms",
    "/accounting",
    "/native-api",
    "/ai",
  ]
  if (legacy.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone()
    url.pathname = `/admin${pathname}`
    return NextResponse.redirect(url)
  }

  if (!authed) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("from", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.svg|icons.svg|placeholder.svg|fonts|api).*)",
  ],
}
