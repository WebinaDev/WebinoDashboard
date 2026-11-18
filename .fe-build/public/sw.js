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

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)

  if (isApi(url)) return

  if (isNavigation(req)) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response("Dashboard is offline. Check your connection and try again.", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain; charset=UTF-8" },
          }),
      ),
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
