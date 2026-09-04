import DateObject from "react-date-object"
import gregorian from "react-date-object/calendars/gregorian"
import persian from "react-date-object/calendars/persian"
import gregorian_en from "react-date-object/locales/gregorian_en"
import persian_fa from "react-date-object/locales/persian_fa"
import { isRtlLocale, toLocaleDigits } from "@webina/ui"
import type { Locale } from "../../../i18n"

function parseIso(iso: string): DateObject | null {
  if (!iso) return null
  const d = new DateObject({
    date: iso,
    format: iso.includes("T") || iso.includes(" ") ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD",
    calendar: gregorian,
    locale: gregorian_en,
  })
  if (!d.isValid) {
    const native = new Date(iso)
    if (Number.isNaN(native.getTime())) return null
    return new DateObject({ date: native, calendar: gregorian, locale: gregorian_en })
  }
  return d
}

export function formatDate(
  iso: string,
  opts: { locale: Locale; includeTime?: boolean } = { locale: "fa" },
): string {
  if (!iso) return "—"
  const d = parseIso(iso)
  if (!d) return "—"

  if (opts.locale === "fa") {
    const jalali = d.convert(persian).setLocale(persian_fa)
    const raw = opts.includeTime
      ? jalali.format("YYYY/MM/DD HH:mm")
      : jalali.format("YYYY/MM/DD")
    return toLocaleDigits(raw, "fa")
  }

  const g = d.setLocale(gregorian_en)
  return opts.includeTime ? g.format("YYYY-MM-DD HH:mm") : g.format("YYYY-MM-DD")
}

export function formatDateTime(iso: string, locale: Locale): string {
  return formatDate(iso, { locale, includeTime: true })
}

/** Display helper — ISO is the only source of truth (jalali arg ignored). */
export function formatDisplayDate(
  iso?: string | null,
  _jalali?: string | null,
  locale: Locale = "fa",
): string {
  if (iso) return formatDate(iso, { locale })
  return "—"
}

export function getCalendarConfig(locale: Locale) {
  return locale === "fa"
    ? { calendar: "jalali" as const, locale: "fa" }
    : { calendar: "gregorian" as const, locale: "en" }
}

export { isRtlLocale, toLocaleDigits, toLatinDigits } from "@webina/ui"
