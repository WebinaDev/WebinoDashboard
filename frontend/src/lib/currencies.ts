/** Allowed store currencies — keep in sync with SetupController / accounting validation. */

export const STORE_CURRENCIES = [
  { code: "IRT", labelKey: "currency_irt", labelFa: "تومان", labelEn: "Toman" },
  { code: "IRR", labelKey: "currency_irr", labelFa: "ریال", labelEn: "Rial" },
] as const

export type StoreCurrencyCode = (typeof STORE_CURRENCIES)[number]["code"]

export const STORE_CURRENCY_CODES: StoreCurrencyCode[] = STORE_CURRENCIES.map(
  (c) => c.code
)

export const DEFAULT_STORE_CURRENCY: StoreCurrencyCode = "IRT"

export type CurrencySymbolId =
  | "default"
  | "toman-1"
  | "toman-2"
  | "rial-1"
  | "rial-2"

export const CURRENCY_SYMBOL_FILES: Record<CurrencySymbolId, string> = {
  default: "/currency/currency-default.svg",
  "toman-1": "/currency/currency-toman-1.svg",
  "toman-2": "/currency/currency-toman-2.svg",
  "rial-1": "/currency/currency-rial-1.svg",
  "rial-2": "/currency/currency-rial-2.svg",
}

export const TOMAN_SYMBOLS: CurrencySymbolId[] = ["default", "toman-1", "toman-2"]
export const RIAL_SYMBOLS: CurrencySymbolId[] = ["rial-1", "rial-2"]

export const DEFAULT_CURRENCY_SYMBOL: CurrencySymbolId = "default"

export function symbolsForCurrency(code: StoreCurrencyCode): CurrencySymbolId[] {
  return code === "IRR" ? RIAL_SYMBOLS : TOMAN_SYMBOLS
}

export function defaultSymbolForCurrency(code: StoreCurrencyCode): CurrencySymbolId {
  return code === "IRR" ? "rial-1" : DEFAULT_CURRENCY_SYMBOL
}

export function normalizeStoreCurrency(
  value: string | null | undefined
): StoreCurrencyCode {
  const code = (value ?? "").trim().toUpperCase()
  return STORE_CURRENCY_CODES.includes(code as StoreCurrencyCode)
    ? (code as StoreCurrencyCode)
    : DEFAULT_STORE_CURRENCY
}

export function normalizeCurrencySymbol(
  currency: StoreCurrencyCode,
  symbol: string | null | undefined
): CurrencySymbolId {
  const allowed = symbolsForCurrency(currency)
  const id = (symbol ?? "").trim() as CurrencySymbolId
  return allowed.includes(id) ? id : defaultSymbolForCurrency(currency)
}

export function currencySymbolSrc(symbol: CurrencySymbolId): string {
  return CURRENCY_SYMBOL_FILES[symbol] ?? CURRENCY_SYMBOL_FILES.default
}

export function currencyLabel(
  code: StoreCurrencyCode,
  locale?: string | null
): string {
  const row = STORE_CURRENCIES.find((c) => c.code === code)
  if (!row) return code
  return locale === "en" ? row.labelEn : row.labelFa
}
