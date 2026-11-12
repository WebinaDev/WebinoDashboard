/** Display / store currencies — keep in sync with App\Support\Currency + Money. */

export const STORE_CURRENCIES = [
  { code: "IRR", labelKey: "currency_irr", labelFa: "ریال", labelEn: "Rial", symbolText: "﷼" },
  { code: "IRT", labelKey: "currency_irt", labelFa: "تومان", labelEn: "Toman", symbolText: "تومان" },
  { code: "IRHT", labelKey: "currency_irht", labelFa: "هزار تومان", labelEn: "Thousand Toman", symbolText: "هزارتومان" },
  { code: "USD", labelKey: "currency_usd", labelFa: "دلار", labelEn: "US Dollar", symbolText: "$" },
  { code: "EUR", labelKey: "currency_eur", labelFa: "یورو", labelEn: "Euro", symbolText: "€" },
  { code: "GBP", labelKey: "currency_gbp", labelFa: "پوند", labelEn: "Pound", symbolText: "£" },
] as const

export type StoreCurrencyCode = (typeof STORE_CURRENCIES)[number]["code"]

export const STORE_CURRENCY_CODES: StoreCurrencyCode[] = STORE_CURRENCIES.map((c) => c.code)

export const DEFAULT_STORE_CURRENCY: StoreCurrencyCode = "IRT"

/** Canonical settlement / storage base for ERP shop + Iranian PSPs. */
export const BASE_CURRENCY: StoreCurrencyCode = "IRR"
export const SETTLEMENT_CURRENCY: StoreCurrencyCode = "IRR"

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

export const DEFAULT_CURRENCY_SYMBOL: CurrencySymbolId = "toman-1"

/** Iranian currency → rial factors (same table as backend App\Support\Currency). */
export const RIAL_FACTORS: Record<string, number> = {
  IRR: 1,
  IRT: 10,
  TOMAN: 10,
  IRHR: 1000,
  IRHT: 10000,
}

export const FOREIGN_CODES: StoreCurrencyCode[] = ["USD", "EUR", "GBP"]

export function isForeignCurrency(code: string | null | undefined): boolean {
  const c = (code ?? "").trim().toUpperCase()
  return FOREIGN_CODES.includes(c as StoreCurrencyCode)
}

export function symbolsForCurrency(code: StoreCurrencyCode): CurrencySymbolId[] {
  if (code === "IRR") return RIAL_SYMBOLS
  if (isForeignCurrency(code)) return []
  return TOMAN_SYMBOLS
}

export function defaultSymbolForCurrency(code: StoreCurrencyCode): CurrencySymbolId {
  return code === "IRR" ? "rial-1" : DEFAULT_CURRENCY_SYMBOL
}

export function normalizeStoreCurrency(
  value: string | null | undefined
): StoreCurrencyCode {
  const code = (value ?? "").trim().toUpperCase()
  if (code === "TOMAN") return "IRT"
  return STORE_CURRENCY_CODES.includes(code as StoreCurrencyCode)
    ? (code as StoreCurrencyCode)
    : DEFAULT_STORE_CURRENCY
}

export function normalizeCurrencySymbol(
  currency: StoreCurrencyCode,
  symbol: string | null | undefined
): CurrencySymbolId {
  const allowed = symbolsForCurrency(currency)
  if (allowed.length === 0) return DEFAULT_CURRENCY_SYMBOL
  const id = (symbol ?? "").trim() as CurrencySymbolId
  return allowed.includes(id) ? id : defaultSymbolForCurrency(currency)
}

export function currencySymbolSrc(symbol: CurrencySymbolId): string {
  return CURRENCY_SYMBOL_FILES[symbol] ?? CURRENCY_SYMBOL_FILES.default
}

export function currencyLabel(
  code: StoreCurrencyCode | string,
  locale?: string | null
): string {
  const row = STORE_CURRENCIES.find((c) => c.code === normalizeStoreCurrency(code))
  if (!row) return String(code)
  return locale === "en" ? row.labelEn : row.labelFa
}

export function currencySymbolText(code: StoreCurrencyCode | string): string {
  const row = STORE_CURRENCIES.find((c) => c.code === normalizeStoreCurrency(code))
  return row?.symbolText ?? String(code)
}

export function rialFactor(code: string | null | undefined): number {
  const c = (code ?? "IRT").trim().toUpperCase() || "IRT"
  return RIAL_FACTORS[c] ?? 1
}

export const toRial = (amount: number, code: string | null | undefined, fxRialPerUnit?: number | null) => {
  const normalized = normalizeStoreCurrency(code)
  if (isForeignCurrency(normalized)) {
    const rate = fxRialPerUnit ?? 0
    if (!(rate > 0)) throw new Error(`missing_exchange_rate:${normalized}→IRR`)
    return amount * rate
  }
  return amount * rialFactor(normalized)
}

export const fromRial = (rial: number, code: string | null | undefined, fxRialPerUnit?: number | null) => {
  const normalized = normalizeStoreCurrency(code)
  if (isForeignCurrency(normalized)) {
    const rate = fxRialPerUnit ?? 0
    if (!(rate > 0)) throw new Error(`missing_exchange_rate:IRR→${normalized}`)
    return rial / rate
  }
  const f = rialFactor(normalized)
  return f > 0 ? rial / f : rial
}

/** Amount Iranian gateways expect (IRR rials). */
export function toGatewayRial(
  amount: number,
  fromCurrency: string | null | undefined = DEFAULT_STORE_CURRENCY,
  fxRialPerUnit?: number | null
): number {
  const code = normalizeStoreCurrency(fromCurrency ?? DEFAULT_STORE_CURRENCY)
  if (code === BASE_CURRENCY) return Math.max(0, Math.round(amount))
  return Math.max(0, Math.round(toRial(amount, code, fxRialPerUnit)))
}
