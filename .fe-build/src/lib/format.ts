import {
  formatDate,
  formatNumber,
  normalizeUiLocale,
} from "@/lib/locale"

/** Locale-aware integer formatting (digits follow active language). */
export function formatInteger(value: number, locale: string): string {
  return formatNumber(value, normalizeUiLocale(locale))
}

export type ShopCurrencyDisplay = {
  currency?: string
  currency_position?: string
  thousand_separator?: string
  decimal_separator?: string
  price_decimals?: number
}

/**
 * Format a major-unit amount using shop.general currency display settings.
 */
export function formatShopPrice(
  amount: number,
  display?: ShopCurrencyDisplay | null,
  fallbackCurrency = "IRT"
): string {
  const currency = (display?.currency || fallbackCurrency).toUpperCase()
  const decimals = Math.max(0, Math.min(6, Number(display?.price_decimals ?? 0)))
  const thousand = display?.thousand_separator ?? ","
  const decimal = display?.decimal_separator || "."
  const pos = display?.currency_position ?? "left"

  const fixed = amount.toFixed(decimals)
  const [intPart, fracPart] = fixed.split(".")
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousand)
  const num =
    fracPart != null && decimals > 0 ? `${withThousands}${decimal}${fracPart}` : withThousands

  switch (pos) {
    case "right":
      return `${num}${currency}`
    case "left_space":
      return `${currency} ${num}`
    case "right_space":
      return `${num} ${currency}`
    default:
      return `${currency}${num}`
  }
}

export function formatLocalizedDate(locale: string, date: Date): string {
  return formatDate(date, normalizeUiLocale(locale))
}

export function formatNowDate(locale: string): string {
  return formatDate(new Date(), normalizeUiLocale(locale))
}
