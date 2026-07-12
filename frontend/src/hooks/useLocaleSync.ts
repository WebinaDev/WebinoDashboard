"use client"

import { useEffect } from "react"
import { useTranslation } from "react-i18next"

/** Keeps <html lang/dir> and persisted locale aligned with i18n. */
export function useLocaleSync() {
  const { i18n } = useTranslation()

  useEffect(() => {
    const lng = i18n.resolvedLanguage ?? i18n.language
    const html = document.documentElement
    html.setAttribute("lang", lng === "fa" ? "fa" : "en")
    html.setAttribute("dir", lng === "fa" ? "rtl" : "ltr")
    localStorage.setItem("locale", lng === "fa" ? "fa" : "en")
  }, [i18n])
}
