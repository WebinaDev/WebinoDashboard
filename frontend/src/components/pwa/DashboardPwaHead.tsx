"use client"

import { useEffect } from "react"

import type { PwaClientBootstrap } from "@/lib/pwa-settings"

type Props = {
  pwa: PwaClientBootstrap
}

export function DashboardPwaHead({ pwa }: Props) {
  useEffect(() => {
    if (!pwa.enabled) return

    const manifest = document.querySelector('link[rel="manifest"]')
    if (!manifest) {
      const link = document.createElement("link")
      link.rel = "manifest"
      link.href = "/manifest.webmanifest"
      document.head.appendChild(link)
    }

    let theme = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (!theme) {
      theme = document.createElement("meta")
      theme.name = "theme-color"
      document.head.appendChild(theme)
    }
    theme.content = pwa.themeColor
  }, [pwa.enabled, pwa.themeColor])

  return null
}
