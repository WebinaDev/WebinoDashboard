/* Webino Dashboard PWA — network-first shell; never cache HTML/API. */
const swUrl = new URL(self.location.href)
const BUILD_ID = swUrl.searchParams.get("v") || "1"
const CACHE = "webino-dashboard-" + BUILD_ID

self.addEventListener("install", (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then(() => Promise.resolve()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key === CACHE) return Promise.resolve()
            return caches.delete(key)
          }),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

function isStaticAsset(url) {
  const p = url.pathname
  return p.includes("/_next/static/") || p.startsWith("/brand/")
}

function isJsOrCss(url) {
  const p = url.pathname
  return p.endsWith(".js") || p.endsWith(".css")
}

function isApi(url) {
  return url.pathname.startsWith("/api/")
}

function isNavigation(req) {
  return (
    req.mode === "navigate" ||
    (req.method === "GET" && req.headers.get("accept")?.includes("text/html"))
  )
}

function isCacheableStatic(url) {
  if (!isStaticAsset(url)) return false
  const p = url.pathname
  return (
    p.endsWith(".png") ||
    p.endsWith(".jpg") ||
    p.endsWith(".jpeg") ||
    p.endsWith(".gif") ||
    p.endsWith(".webp") ||
    p.endsWith(".svg") ||
    p.endsWith(".woff") ||
    p.endsWith(".woff2") ||
    p.endsWith(".ttf")
  )
}

/*
 * The till and the kitchen board are the two screens that must survive a dropped connection.
 *
 * The shell used to answer every offline navigation with a 503, which is exactly the moment a
 * cashier cannot reach the till — so an "offline queue" existed that no one could ever reach.
 * Those two routes (and the login page, so a session can be re-established) are now cached on
 * first visit; an offline navigation to one serves the last good shell. Everything else keeps
 * the network-first behaviour, deliberately: serving a stale admin page for a shop's settings
 * is worse than an honest error.
 */
const OFFLINE_ROUTES = ["/dashboard/cafe/pos", "/dashboard/cafe/kitchen", "/login"]

function isOfflineRoute(pathname) {
  return OFFLINE_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"))
}

function shellUrl(pathname) {
  // Keyed by route, not by full URL: a query string on a till deep-link must not create a
  // second cache entry that is never warm.
  return new URL("/__offline-shell?route=" + encodeURIComponent(pathname), self.location.origin).toString()
}

async function respondOfflineShell(pathname) {
  const cached = await caches.match(shellUrl(pathname))
  if (cached) return cached

  return new Response(
    "<!doctype html><meta charset=utf-8><title>Offline</title><body style=\"font-family:system-ui;padding:2rem\"><h1>Offline</h1><p>This screen has not been opened on this device yet, so there is no offline copy. Open it once while online.</p></body>",
    { status: 503, statusText: "Service Unavailable", headers: { "Content-Type": "text/html; charset=UTF-8" } },
  )
}

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)

  if (isApi(url)) return

  if (isNavigation(req)) {
    const pathname = url.pathname

    event.respondWith(
      fetch(req)
        .then((res) => {
          // Warm the offline copy on a successful navigation to a till/kitchen route.
          if (isOfflineRoute(pathname) && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(shellUrl(pathname), copy))
          }
          return res
        })
        .catch(() => (isOfflineRoute(pathname) ? respondOfflineShell(pathname) : Promise.resolve(
          new Response("Dashboard is offline. Check your connection and try again.", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain; charset=UTF-8" },
          }),
        ))),
    )
    return
  }

  if (!isStaticAsset(url)) return

  if (isJsOrCss(url)) {
    event.respondWith(fetch(req).catch(() => caches.match(req).then((c) => c || fetch(req))))
    return
  }

  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((res) => {
          const copy = res.clone()
          if (res.ok) {
            caches.open(CACHE).then((cache) => cache.put(req, copy))
          }
          return res
        })
      }),
    )
  }
})
