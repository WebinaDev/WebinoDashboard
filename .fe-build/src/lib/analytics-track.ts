"use client"

type Bootstrap = {
  tracking_enabled?: boolean
  hit_token?: string
  endpoint?: string
  skip?: boolean
}

type TrackerConfig = {
  hitToken: string
  endpoint: string
  host: string
}

export type AnalyticsEventType = "product_view" | "add_to_cart" | "checkout_start"

const SESSION_KEY = "webino_analytics_sid"
const PAGE_KEY = "webino_analytics_pages"

let configPromise: Promise<TrackerConfig | null> | null = null
let sessionId = ""

function uuid(): string {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "")
  } catch {
    /* ignore */
  }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/** Session id shared by pageviews and funnel events (per browser tab). */
export function getAnalyticsSessionId(): string {
  if (sessionId) return sessionId
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY) || ""
    if (!sessionId) {
      sessionId = uuid()
      sessionStorage.setItem(SESSION_KEY, sessionId)
      sessionStorage.setItem(PAGE_KEY, "0")
    }
  } catch {
    sessionId = uuid()
  }
  return sessionId
}

export function bumpAnalyticsPageCount(): void {
  try {
    const pages = parseInt(sessionStorage.getItem(PAGE_KEY) || "0", 10) || 0
    sessionStorage.setItem(PAGE_KEY, String(pages + 1))
  } catch {
    /* ignore */
  }
}

export function getAnalyticsPageCount(): number {
  try {
    return parseInt(sessionStorage.getItem(PAGE_KEY) || "1", 10) || 1
  } catch {
    return 1
  }
}

/** Resolves the tracker config once; null when tracking is off or this visitor is excluded. */
export function loadAnalyticsConfig(): Promise<TrackerConfig | null> {
  if (typeof window === "undefined") return Promise.resolve(null)
  if (configPromise) return configPromise
  configPromise = (async () => {
    try {
      const host = window.location.host
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ""
      const res = await fetch(`${apiBase}/api/v1/public/analytics/bootstrap`, {
        headers: host ? { "X-Tenant-Domain": host } : {},
        credentials: "include",
      })
      if (!res.ok) return null
      const json = (await res.json()) as { data?: Bootstrap }
      const cfg = json.data
      if (!cfg?.tracking_enabled || cfg.skip || !cfg.hit_token || !cfg.endpoint) return null
      return { hitToken: cfg.hit_token, endpoint: cfg.endpoint, host }
    } catch {
      return null
    }
  })()
  return configPromise
}

export function sendAnalyticsHit(cfg: TrackerConfig, payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload)
  const url = `${cfg.endpoint}${cfg.endpoint.includes("?") ? "&" : "?"}token=${encodeURIComponent(cfg.hitToken)}`
  try {
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Analytics-Token": cfg.hitToken,
        "X-Tenant-Domain": cfg.host,
      },
      body,
      keepalive: true,
      credentials: "include",
      mode: "cors",
    }).catch(() => undefined)
  } catch {
    try {
      navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))
    } catch {
      /* ignore */
    }
  }
}

/** Storefront funnel event (product view, add to cart, checkout start). Never throws. */
export function trackAnalyticsEvent(type: AnalyticsEventType, opts?: { productId?: number }): void {
  if (typeof window === "undefined") return
  void loadAnalyticsConfig().then((cfg) => {
    if (!cfg) return
    const productId = opts?.productId && opts.productId > 0 ? Math.floor(opts.productId) : undefined
    sendAnalyticsHit(cfg, {
      type,
      uri: window.location.pathname + window.location.search,
      post_id: productId,
      title: document.title || "",
      session_id: getAnalyticsSessionId(),
    })
  })
}
