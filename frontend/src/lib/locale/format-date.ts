import {
  emptyMark,
  formatDate as formatSharedDate,
  isRtlLocale,
  toLatinDigits,
  toLocaleDigits,
} from "@webina/ui"
import type { Locale } from "../../../i18n"

/** Display helper kept for older call sites. ISO Gregorian is the source of truth. */
export function formatDate(
  iso: string,
  opts: { locale: Locale; includeTime?: boolean } = { locale: "fa" },
): string {
  if (!iso) return emptyMark(opts.locale)
  return formatSharedDate(iso, opts.locale, { includeTime: opts.includeTime })
}

export function formatDateTime(iso: string, locale: Locale): string {
  return formatDate(iso, { locale, includeTime: true })
}

export function formatDisplayDate(
  iso?: string | null,
  _jalali?: string | null,
  locale: Locale = "fa",
): string {
  if (iso) return formatDate(iso, { locale })
  return emptyMark(locale)
}

export function getCalendarConfig(locale: Locale) {
  return locale === "fa"
    ? { calendar: "jalali" as const, locale: "fa" }
    : { calendar: "gregorian" as const, locale: "en" }
}

export { isRtlLocale, toLocaleDigits, toLatinDigits }
