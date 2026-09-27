"use client"

import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import {
  normalizeCurrencySymbol,
  normalizeStoreCurrency,
  type CurrencySymbolId,
  type StoreCurrencyCode,
} from "@/lib/currencies"

type TenantCurrencyDto = {
  default_currency?: string | null
  branding?: { currency_symbol?: string | null } | null
}

export type StoreCurrency = {
  currency: StoreCurrencyCode
  symbol: CurrencySymbolId
}

export const STORE_CURRENCY_QUERY_KEY = ["tenant", "store-currency"] as const

/** Store currency + symbol from `/api/v1/tenant` (cached for the whole dashboard session). */
export function useStoreCurrency(enabled = true): StoreCurrency {
  const { data } = useQuery({
    queryKey: STORE_CURRENCY_QUERY_KEY,
    enabled,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: () => api<TenantCurrencyDto>("/api/v1/tenant"),
  })
  const currency = normalizeStoreCurrency(data?.default_currency)
  return {
    currency,
    symbol: normalizeCurrencySymbol(currency, data?.branding?.currency_symbol),
  }
}
