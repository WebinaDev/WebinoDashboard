import { emptyMark, formatNumber, normalizeUiLocale, toLatinDigits, toLocaleDigits } from "@/lib/locale"

/** Replace ASCII digits in free text with the active locale digits (Persian for `fa`). */
export function localizeDigits(value: string | number | null | undefined, locale: string): string {
  if (value == null) return ""
  return toLocaleDigits(String(value), normalizeUiLocale(locale))
}

/** Grouped integer in locale digits; non-numeric values fall back to `empty`. */
export function localizeNumber(value: number | string | null | undefined, locale: string, empty?: string): string {
  if (value == null || value === "") return empty ?? emptyMark(locale)
  const n = typeof value === "number" ? value : Number(toLatinDigits(String(value)))
  return Number.isFinite(n) ? formatNumber(n, normalizeUiLocale(locale)) : localizeDigits(String(value), locale)
}

export { toLatinDigits as toAsciiDigits }
