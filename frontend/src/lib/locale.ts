/**
 * Product locale helpers — thin re-exports from shared `@webina/ui`.
 */
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
