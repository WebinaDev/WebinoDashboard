"use client"

import { useEffect } from "react"
import { useLocale } from "next-intl"

/** Keeps <html lang/dir> and persisted locale aligned with next-intl. */
export function useLocaleSync() {
  const locale = useLocale()

  useEffect(() => {
    const lng = locale.startsWith("fa") ? "fa" : "en"
    const html = document.documentElement
    html.setAttribute("lang", lng)
    html.setAttribute("dir", lng === "fa" ? "rtl" : "ltr")
    localStorage.setItem("locale", lng)
  }, [locale])
}
