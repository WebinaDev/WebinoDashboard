import {
  normalizeCurrencySymbol,
  normalizeStoreCurrency,
  type CurrencySymbolId,
  type StoreCurrencyCode,
} from "@/lib/currencies"

export type BuilderCurrency = {
  currency: StoreCurrencyCode
  symbol: CurrencySymbolId
  thousandSeparator: string
}

export type PublicTenantCurrency = {
  currency?: string | null
  default_currency?: string | null
  currency_symbol?: string | null
  thousand_separator?: string | null
  branding?: { currency_symbol?: string | null } | null
}

export function resolveBuilderCurrency(raw?: PublicTenantCurrency | null): BuilderCurrency {
  const currency = normalizeStoreCurrency(raw?.currency ?? raw?.default_currency)
  return {
    currency,
    symbol: normalizeCurrencySymbol(currency, raw?.currency_symbol ?? raw?.branding?.currency_symbol),
    thousandSeparator: typeof raw?.thousand_separator === "string" && raw.thousand_separator ? raw.thousand_separator : ",",
  }
}
