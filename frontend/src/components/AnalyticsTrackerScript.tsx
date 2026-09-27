"use client"

import { useEffect } from "react"

type Bootstrap = {
  tracking_enabled?: boolean
  hit_token?: string
  endpoint?: string
}

/**
 * Storefront pageview tracker — loads only when native tracking is enabled.
 */
export function AnalyticsTrackerScript() {
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const host = typeof window !== "undefined" ? window.location.host : ""
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? ""
        const res = await fetch(`${apiBase}/api/v1/public/analytics/bootstrap`, {
          headers: host ? { "X-Tenant-Domain": host } : {},
          credentials: "omit",
        })
        if (!res.ok || cancelled) return
        const json = (await res.json()) as { data?: Bootstrap }
        const cfg = json.data
        if (!cfg?.tracking_enabled || !cfg.hit_token || !cfg.endpoint) return

        const SESSION_KEY = "webino_analytics_sid"
        const PAGE_KEY = "webino_analytics_pages"
        const uuid = () => {
          try {
            if (window.crypto?.randomUUID) return window.crypto.randomUUID().replace(/-/g, "")
          } catch {
            /* ignore */
          }
          return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
        }
        let sessionId = ""
        try {
          sessionId = sessionStorage.getItem(SESSION_KEY) || ""
          if (!sessionId) {
            sessionId = uuid()
            sessionStorage.setItem(SESSION_KEY, sessionId)
            sessionStorage.setItem(PAGE_KEY, "0")
          }
          const pages = parseInt(sessionStorage.getItem(PAGE_KEY) || "0", 10) || 0
          sessionStorage.setItem(PAGE_KEY, String(pages + 1))
        } catch {
          sessionId = uuid()
        }

        const param = (name: string) => {
          try {
            return new URLSearchParams(window.location.search).get(name) || ""
          } catch {
            return ""
          }
        }

        const send = (payload: Record<string, unknown>) => {
          const body = JSON.stringify(payload)
          const url = `${cfg.endpoint}${cfg.endpoint!.includes("?") ? "&" : "?"}token=${encodeURIComponent(cfg.hit_token!)}`
          try {
            void fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Analytics-Token": cfg.hit_token!,
                "X-Tenant-Domain": host,
              },
              body,
              keepalive: true,
              credentials: "omit",
              mode: "cors",
            })
          } catch {
            try {
              navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))
            } catch {
              /* ignore */
            }
          }
        }

        const started = Date.now()
        send({
          type: "pageview",
          uri: window.location.pathname + window.location.search,
          referrer: document.referrer || "",
          title: document.title || "",
          utm_source: param("utm_source"),
          utm_medium: param("utm_medium"),
          utm_campaign: param("utm_campaign"),
          session_id: sessionId,
        })

        let flushed = false
        const flush = () => {
          if (flushed) return
          flushed = true
          let pageCount = 1
          try {
            pageCount = parseInt(sessionStorage.getItem(PAGE_KEY) || "1", 10) || 1
          } catch {
            /* ignore */
          }
          send({
            type: "session",
            session_id: sessionId,
            duration_ms: Math.max(0, Date.now() - started),
            page_count: pageCount,
            is_exit: true,
          })
        }
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") flush()
        })
        window.addEventListener("pagehide", flush)
      } catch {
        /* ignore */
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return null
}
