"use client"

import { useEffect } from "react"

import {
  bumpAnalyticsPageCount,
  getAnalyticsPageCount,
  getAnalyticsSessionId,
  loadAnalyticsConfig,
  sendAnalyticsHit,
} from "@/lib/analytics-track"

/**
 * Storefront pageview tracker — loads only when native tracking is enabled
 * and the current (optionally logged-in) visitor is not excluded.
 */
export function AnalyticsTrackerScript() {
  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | null = null
    const run = async () => {
      try {
        const cfg = await loadAnalyticsConfig()
        if (!cfg || cancelled) return

        const sessionId = getAnalyticsSessionId()
        bumpAnalyticsPageCount()

        const param = (name: string) => {
          try {
            return new URLSearchParams(window.location.search).get(name) || ""
          } catch {
            return ""
          }
        }

        const started = Date.now()
        sendAnalyticsHit(cfg, {
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
          sendAnalyticsHit(cfg, {
            type: "session",
            session_id: sessionId,
            duration_ms: Math.max(0, Date.now() - started),
            page_count: getAnalyticsPageCount(),
            is_exit: true,
          })
        }
        const onVisibility = () => {
          if (document.visibilityState === "hidden") flush()
        }
        document.addEventListener("visibilitychange", onVisibility)
        window.addEventListener("pagehide", flush)
        cleanup = () => {
          document.removeEventListener("visibilitychange", onVisibility)
          window.removeEventListener("pagehide", flush)
        }
      } catch {
        /* ignore */
      }
    }
    void run()
    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  return null
}
