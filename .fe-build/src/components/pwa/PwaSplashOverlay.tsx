"use client"

import { useEffect, useState } from "react"

import type { PwaClientBootstrap } from "@/lib/pwa-settings"

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false
  if (window.matchMedia("(display-mode: standalone)").matches) return true
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

type Props = {
  pwa: PwaClientBootstrap
}

export function PwaSplashOverlay({ pwa }: Props) {
  const [show, setShow] = useState(() => {
    if (!pwa.enabled || !pwa.splashEnabled) return false
    return isStandaloneDisplay()
  })

  useEffect(() => {
    if (!show) return
    const t = window.setTimeout(() => setShow(false), 900)
    return () => window.clearTimeout(t)
  }, [show])

  if (!show) return null

  return (
    <div
      role="presentation"
      aria-hidden
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 transition-opacity duration-300"
      style={{ backgroundColor: pwa.backgroundColor }}
    >
      {pwa.iconUrl ? (
        <img
          src={pwa.iconUrl}
          alt=""
          width={96}
          height={96}
          className="size-24 rounded-2xl object-contain shadow-sm"
        />
      ) : null}
      {pwa.name ? (
        <p className="text-foreground/90 max-w-[80%] truncate text-center text-base font-medium">
          {pwa.name}
        </p>
      ) : null}
    </div>
  )
}
