"use client"

import { CurrencyMark } from "@/components/CurrencyMark"
import { currencyLabel, normalizeCurrencySymbol, normalizeStoreCurrency } from "@/lib/currencies"
import type { ShopCurrencyDisplay } from "@/lib/format"
import { cn } from "@/lib/utils"

import { formatCafeAmount } from "../lib/helpers"

/**
 * Cafe price with the dashboard currency glyph (not the word «تومان»).
 * `amount` is always Rial minors from the catalog/cart.
 */
export function CafeMoney({
  amount,
  currency,
  display,
  locale,
  className,
}: {
  amount: number
  currency?: string | null
  display?: ShopCurrencyDisplay | null
  locale?: string
  className?: string
}) {
  const code = normalizeStoreCurrency(display?.currency || currency || "IRT")
  const symbol = normalizeCurrencySymbol(code, display?.currency_symbol)
  const digits = formatCafeAmount(amount, currency, display, locale === "en" ? "en" : "fa")
  // Match shop MoneyDisplay / BuilderPrice: glyph on the left of the number (dir=ltr).
  // `currency_position` right* keeps the glyph after the digits when the merchant opts in.
  const pos = (display?.currency_position || "left").toLowerCase()
  const markAfter = pos === "right" || pos === "right_space"
  const mark = <CurrencyMark symbol={symbol} alt={currencyLabel(code, locale === "en" ? "en" : "fa")} />
  const num = <span style={{ fontVariantNumeric: "tabular-nums" }}>{digits}</span>
  return (
    <span
      className={cn("cafe-money", className)}
      dir="ltr"
      style={{ display: "inline-flex", alignItems: "baseline", gap: "0.2em", whiteSpace: "nowrap" }}
    >
      {markAfter ? (
        <>
          {num}
          {mark}
        </>
      ) : (
        <>
          {mark}
          {num}
        </>
      )}
    </span>
  )
}
