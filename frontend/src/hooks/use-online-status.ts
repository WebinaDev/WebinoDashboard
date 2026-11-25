"use client"

import { useEffect, useState } from "react"

/**
 * Whether the browser thinks it is online, and whether the last request actually reached the
 * server.
 *
 * The two disagree — a till on a shop's Wi-Fi is "online" while the router is dead — so screens
 * that must behave differently offline should prefer what the last call told them. This hook is
 * the cheap half: it drives the banners and the disabled states, and the POS offline queue is the
 * half that decides whether a sale is worth accepting.
 */
export function useOnlineStatus(): boolean {
  // Assume online during SSR and the first paint: showing an "offline" banner to a visitor with
  // a working connection is a worse first impression than showing it a moment late.
  const [online, setOnline] = useState(true)

  useEffect(() => {
    if (typeof window === "undefined") return

    const sync = () => setOnline(window.navigator.onLine !== false)
    sync()

    window.addEventListener("online", sync)
    window.addEventListener("offline", sync)
    return () => {
      window.removeEventListener("online", sync)
      window.removeEventListener("offline", sync)
    }
  }, [])

  return online
}
