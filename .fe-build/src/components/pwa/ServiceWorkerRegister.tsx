"use client"

import { useEffect } from "react"

import { registerDashboardServiceWorker } from "@/lib/register-dashboard-sw"
import type { PwaClientBootstrap } from "@/lib/pwa-settings"

type Props = {
  pwa: PwaClientBootstrap
}

export function ServiceWorkerRegister({ pwa }: Props) {
  useEffect(() => {
    if (!pwa.enabled) return

    const run = () => {
      void registerDashboardServiceWorker()
    }

    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(run, { timeout: 4000 })
      return () => cancelIdleCallback(id)
    }
    const id = globalThis.setTimeout(run, 2000)
    return () => globalThis.clearTimeout(id)
  }, [pwa.enabled])

  return null
}
