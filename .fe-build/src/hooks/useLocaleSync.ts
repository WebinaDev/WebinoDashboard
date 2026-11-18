"use client"

import { useEffect } from "react"
import { useLocale } from "next-intl"

import { htmlDir, normalizeUiLocale } from "@/lib/locale"

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Single writer for <html lang/dir>.
 * Source of truth: next-intl locale (from NEXT_LOCALE cookie on the server).
 * localStorage is a mirror only.
 */
export function useLocaleSync() {
  const locale = useLocale()

  useEffect(() => {
    const lng = normalizeUiLocale(locale)
    const html = document.documentElement
    html.setAttribute("lang", lng)
    html.setAttribute("dir", htmlDir(lng))
    localStorage.setItem("locale", lng)
    if (readCookie("NEXT_LOCALE") !== lng) {
      document.cookie = `NEXT_LOCALE=${lng};path=/;max-age=${60 * 60 * 24 * 365}`
    }
  }, [locale])
}
