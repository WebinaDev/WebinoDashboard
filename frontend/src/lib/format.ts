import {
  formatDate,
  formatNumber,
  normalizeUiLocale,
} from "@/lib/locale"

/** Locale-aware integer formatting (digits follow active language). */
export function formatInteger(value: number, locale: string): string {
  return formatNumber(value, normalizeUiLocale(locale))
}

export function formatLocalizedDate(locale: string, date: Date): string {
  return formatDate(date, normalizeUiLocale(locale))
}

export function formatNowDate(locale: string): string {
  return formatDate(new Date(), normalizeUiLocale(locale))
}
