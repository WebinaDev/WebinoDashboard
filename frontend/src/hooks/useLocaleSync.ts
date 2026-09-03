"use client"

import { useEffect } from "react"
import { useLocale } from "next-intl"

import { htmlDir, normalizeUiLocale } from "@/lib/locale"

/** Keeps <html lang/dir> and persisted locale aligned with next-intl. */
export function useLocaleSync() {
  const locale = useLocale()

  useEffect(() => {
    const lng = normalizeUiLocale(locale)
    const html = document.documentElement
    html.setAttribute("lang", lng)
    html.setAttribute("dir", htmlDir(lng))
    localStorage.setItem("locale", lng)
    document.cookie = `NEXT_LOCALE=${lng};path=/;max-age=${60 * 60 * 24 * 365}`
  }, [locale])
}
