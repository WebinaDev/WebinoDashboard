"use client"

import { useLocale } from "next-intl"

import { htmlDir } from "@/lib/locale"

/**
 * Returns the text direction ("rtl" | "ltr") based on the current locale.
 * Used by UI components (e.g. DropdownMenu) to set the `dir` attribute.
 */
export function useTextDirection(): "rtl" | "ltr" {
  const locale = useLocale()
  return htmlDir(locale)
}
