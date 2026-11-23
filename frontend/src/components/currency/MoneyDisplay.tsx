"use client"

import { useLocale } from "next-intl"
import type { ReactNode } from "react"

import { CurrencyMark } from "@/components/CurrencyMark"
import {
  currencyLabel,
  defaultSymbolForCurrency,
  normalizeCurrencySymbol,
  normalizeStoreCurrency,
} from "@/lib/currencies"
import { formatNumber, normalizeUiLocale, toLatinDigits } from "@/lib/locale"
import { useStoreCurrency } from "@/lib/store-currency"
import { cn } from "@/lib/utils"

type MoneyDisplayProps = {
  /** Amount in store display units (API `*_minor` fields: toman or rial, no fractions). */
  amount: number | string | null | undefined
  /** ISO-like store code (`IRT` / `IRR`). Defaults to the tenant currency. */
  currency?: string | null
  /** Currency symbol id (`default`, `toman-1`, `rial-1`, …). Defaults to the tenant symbol. */
  symbol?: string | null
  className?: string
  amountClassName?: string
  prefix?: ReactNode
}

function numericAmount(amount: MoneyDisplayProps["amount"]): number {
  if (amount == null || amount === "") return 0
  if (typeof amount === "number") return Number.isFinite(amount) ? amount : 0
  const n = parseFloat(toLatinDigits(amount).replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export function formatMoneyText(
  amount: MoneyDisplayProps["amount"],
  locale: string,
  currency?: string | null
): string {
  const lng = normalizeUiLocale(locale)
  const code = normalizeStoreCurrency(currency)
  return `${formatNumber(numericAmount(amount), lng)} ${currencyLabel(code, lng)}`
}

export function MoneyDisplay({
  amount,
  currency,
  symbol,
  className,
  amountClassName,
  prefix,
}: MoneyDisplayProps) {
  const locale = normalizeUiLocale(useLocale())
  const store = useStoreCurrency(!currency || !symbol)
  const code = currency
    ? normalizeStoreCurrency(currency)
    : normalizeStoreCurrency(store?.currency)
  const symbolId = symbol
    ? normalizeCurrencySymbol(code, symbol)
    : currency && code !== normalizeStoreCurrency(store?.currency)
      ? defaultSymbolForCurrency(code)
      : normalizeCurrencySymbol(code, store?.symbol)

  return (
    <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap", className)} dir="ltr">
      {prefix}
      <CurrencyMark symbol={symbolId} alt={currencyLabel(code, locale)} />
      <span className={cn("tabular-nums", amountClassName)}>
        {formatNumber(numericAmount(amount), locale)}
      </span>
    </span>
  )
}

/**
 * Money as a single inline node, for call sites that build a string today.
 *
 * `formatCurrency(v, locale, "IRT")` renders the literal code "IRT" because ICU has no
 * symbol for it — the storefront then shows Latin letters inside a Persian UI. This keeps
 * the amount and the tenant's chosen SVG glyph together so the code never surfaces.
 *
 * A zero amount is a real amount: it renders as `0` with the glyph, never as a dash. The
 * missing-value case is `null`/`undefined`, which the caller decides how to show.
 */
export function MoneyText({
  amount,
  currency,
  symbol,
  className,
  fallback = null,
}: {
  amount: number | string | null | undefined
  currency?: string | null
  symbol?: string | null
  className?: string
  /** Rendered when the amount is absent (`null`/`undefined`/`""`). Zero is not absent. */
  fallback?: ReactNode
}) {
  const isMissing = amount === null || amount === undefined || amount === ""
  if (isMissing) return <>{fallback}</>
  return <MoneyDisplay amount={amount} currency={currency} symbol={symbol} className={className} />
}
