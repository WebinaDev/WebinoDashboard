/**
 * Product locale helpers — re-exports from `@webina/ui` plus layout helpers.
 */
import { isRtlLocale } from "@webina/ui"

export {
  formatCurrency,
  formatDate,
  formatNumber,
  getIntlLocale,
  isRtlLocale,
  normalizeUiLocale,
  toLatinDigits,
  toLocaleDigits,
  type FormatDateOptions,
  type UiLocale,
} from "@webina/ui"

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
