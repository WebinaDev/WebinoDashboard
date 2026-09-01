/** Shared UI locale helpers (`fa` | `en`). */

export type UiLocale = "en" | "fa"

export function normalizeUiLocale(locale?: string | null): UiLocale {
  if (!locale) return "fa"
  return locale.toLowerCase().startsWith("fa") ? "fa" : "en"
}

export function isRtlLocale(locale?: string | null): boolean {
  return normalizeUiLocale(locale) === "fa"
}

export function getIntlLocale(locale?: string | null): string {
  return normalizeUiLocale(locale) === "fa" ? "fa-IR" : "en-US"
}

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
const LATIN_DIGITS = "0123456789"

/** Convert Latin digits to locale digits (`fa` → Persian ۰۱۲…). */
export function toLocaleDigits(
  value: string | number,
  locale?: string | null,
): string {
  const text = String(value)
  if (normalizeUiLocale(locale) !== "fa") {
    return text
  }
  return text.replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d)
}

/** Normalize Persian/Arabic-Indic digits to Latin before API submit. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => LATIN_DIGITS[PERSIAN_DIGITS.indexOf(d)] ?? d)
    .replace(/[٠-٩]/g, (d) => LATIN_DIGITS[ARABIC_DIGITS.indexOf(d)] ?? d)
}

export function formatNumber(
  value: number,
  locale?: string | null,
  options?: Intl.NumberFormatOptions,
): string {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    return String(value)
  }
  const useFa = normalizeUiLocale(locale) === "fa"
  return new Intl.NumberFormat(useFa ? "fa-IR" : "en-US", {
    maximumFractionDigits: 0,
    numberingSystem: useFa ? "arabext" : "latn",
    ...options,
  }).format(n)
}

export function formatCurrency(
  value: number,
  locale?: string | null,
  currency = "IRR",
  options?: Intl.NumberFormatOptions,
): string {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    return String(value)
  }
  const useFa = normalizeUiLocale(locale) === "fa"
  return new Intl.NumberFormat(useFa ? "fa-IR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    numberingSystem: useFa ? "arabext" : "latn",
    ...options,
  }).format(n)
}

export type FormatDateOptions = Intl.DateTimeFormatOptions & {
  includeTime?: boolean
}

/** Intl-based date formatting. `fa` uses `fa-IR` (Persian calendar when supported). */
export function formatDate(
  value: string | number | Date,
  locale?: string | null,
  options?: FormatDateOptions,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === "number" ? value : String(value))
  if (Number.isNaN(date.getTime())) {
    return value == null || value === "" ? "—" : String(value)
  }

  const useFa = normalizeUiLocale(locale) === "fa"
  const { includeTime, ...intlOpts } = options ?? {}
  const base: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
    ...intlOpts,
  }

  if (useFa) {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      numberingSystem: "arabext",
      ...base,
    }).format(date)
  }

  return new Intl.DateTimeFormat("en-US", base).format(date)
}
