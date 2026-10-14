"use client"

import { useEffect, useState } from "react"

import { evaluateConditions, hasConditions, needsSession, type DisplayConditions } from "../conditions"

let sessionJob: Promise<{ loggedIn: boolean; cartCount: number }> | null = null
function loadSession() {
  if (!sessionJob) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? ""
    sessionJob = fetch(`${base}/api/v1/cart`, { credentials: "include", headers: { Accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) return { loggedIn: false, cartCount: 0 }
        const json = (await res.json().catch(() => null)) as { data?: { items?: unknown[] } } | null
        return { loggedIn: true, cartCount: Array.isArray(json?.data?.items) ? json.data.items.length : 0 }
      })
      .catch(() => ({ loggedIn: false, cartCount: 0 }))
  }
  return sessionJob
}

/** Visible on the live site? Editor always shows the widget. Hidden while login/cart data loads, and before hydration. */
export function useConditionsVisible(conditions: DisplayConditions | undefined, editing: boolean): boolean {
  const active = !editing && hasConditions(conditions)
  const [session, setSession] = useState<{ loggedIn: boolean; cartCount: number } | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    if (!active) return
    setNow(new Date())
    if (!needsSession(conditions)) return
    let cancel = false
    void loadSession().then((value) => {
      if (!cancel) setSession(value)
    })
    return () => {
      cancel = true
    }
  }, [active, conditions])
  if (!active || !conditions) return true
  if (!now) return false
  const result = evaluateConditions(conditions, {
    loggedIn: session?.loggedIn ?? null,
    cartCount: session?.cartCount ?? null,
    now,
    search: new URLSearchParams(typeof window === "undefined" ? "" : window.location.search),
  })
  return result === true
}
