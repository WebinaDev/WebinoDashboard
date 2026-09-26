/** Allowed store currencies — keep in sync with SetupController validation. */
export const STORE_CURRENCIES = [
  { code: "IRR", labelKey: "currency_irr" },
  { code: "IRT", labelKey: "currency_irt" },
  { code: "USD", labelKey: "currency_usd" },
  { code: "EUR", labelKey: "currency_eur" },
  { code: "AED", labelKey: "currency_aed" },
] as const

export type StoreCurrencyCode = (typeof STORE_CURRENCIES)[number]["code"]

export const STORE_CURRENCY_CODES: StoreCurrencyCode[] = STORE_CURRENCIES.map(
  (c) => c.code
)

export const DEFAULT_STORE_CURRENCY: StoreCurrencyCode = "IRR"

export function normalizeStoreCurrency(
  value: string | null | undefined
): StoreCurrencyCode {
  const code = (value ?? "").trim().toUpperCase()
  return STORE_CURRENCY_CODES.includes(code as StoreCurrencyCode)
    ? (code as StoreCurrencyCode)
    : DEFAULT_STORE_CURRENCY
}
