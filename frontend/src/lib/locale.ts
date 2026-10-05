/**
 * Product locale helpers — re-exports from `@webina/ui` plus layout helpers.
 * `formatDate` for `fa` is Jalali via `react-date-object`, not ICU.
 *
 * Preferred FA date path for admin UI:
 * - Display: `formatDate` / `formatDisplayDate` / `formatDisplayDateTime` from `@/lib/locale` or `@/lib/format-date`
 * - Inputs: `LocaleDatePicker` (stores Gregorian ISO)
 * Avoid masking raw ISO with `toLocaleDigits` alone.
 */
import DateObject from "react-date-object"
import gregorian from "react-date-object/calendars/gregorian"
import persian from "react-date-object/calendars/persian"
import gregorianEn from "react-date-object/locales/gregorian_en"
import persianFa from "react-date-object/locales/persian_fa"
import {
  formatDate as formatDateIntl,
  isRtlLocale,
  normalizeUiLocale,
  toLocaleDigits,
  type FormatDateOptions,
} from "@webina/ui"

export {
  emptyMark,
  formatCurrency,
  formatNumber,
  getIntlLocale,
  isRtlLocale,
  normalizeUiLocale,
  toLatinDigits,
  toLocaleDigits,
  type FormatDateOptions,
  type UiLocale,
} from "@webina/ui"

function gregorianDateObject(value: string | number | Date): DateObject | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return new DateObject({ date: value, calendar: gregorian, locale: gregorianEn })
  }
  if (typeof value === "number") {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return new DateObject({ date, calendar: gregorian, locale: gregorianEn })
  }
  const text = String(value).trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parsed = new DateObject({
      date: text,
      format: "YYYY-MM-DD",
      calendar: gregorian,
      locale: gregorianEn,
    })
    return parsed.isValid ? parsed : null
  }
  const wall = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(text)
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)
  if (wall && !hasZone) {
    const clock = wall[2].length === 5 ? `${wall[2]}:00` : wall[2]
    const parsed = new DateObject({
      date: `${wall[1]} ${clock}`,
      format: "YYYY-MM-DD HH:mm:ss",
      calendar: gregorian,
      locale: gregorianEn,
    })
    return parsed.isValid ? parsed : null
  }
  const native = new Date(text)
  if (Number.isNaN(native.getTime())) return null
  return new DateObject({ date: native, calendar: gregorian, locale: gregorianEn })
}

function jalaliPattern(options?: FormatDateOptions): string {
  const style = options?.dateStyle ?? "medium"
  const date =
    style === "full"
      ? "dddd D MMMM YYYY"
      : style === "long" || style === "medium"
        ? "D MMMM YYYY"
        : "YYYY/MM/DD"
  const wantsTime = Boolean(options?.includeTime || options?.timeStyle)
  if (!wantsTime) return date
  const time = options?.timeStyle === "long" || options?.timeStyle === "full" ? "HH:mm:ss" : "HH:mm"
  return `${date} ${time}`
}

/** Jalali calendar and Persian digits for `fa`. Gregorian `Intl` for `en`. */
export function formatDate(
  value: string | number | Date,
  locale?: string | null,
  options?: FormatDateOptions,
): string {
  if (normalizeUiLocale(locale) !== "fa") {
    return formatDateIntl(value, locale, options)
  }
  const parsed = gregorianDateObject(value)
  if (!parsed) {
    return value == null || value === "" ? "—" : String(value)
  }
  const jalali = parsed.convert(persian).setLocale(persianFa)
  return toLocaleDigits(jalali.format(jalaliPattern(options)), "fa")
}

export type AppLocale = import("@webina/ui").UiLocale

/** @deprecated Prefer `toLocaleDigits`. */
export { toLocaleDigits as localizeDigits } from "@webina/ui"

/** Document direction for the locale (`fa` → RTL). */
export function htmlDir(locale?: string | null): "rtl" | "ltr" {
  return isRtlLocale(locale) ? "rtl" : "ltr"
}

/**
 * Physical side for shadcn Sidebar / Sheet / dropdowns.
 * Farsi: right. English: left.
 */
export function sidebarSide(locale?: string | null): "left" | "right" {
  return isRtlLocale(locale) ? "right" : "left"
}
