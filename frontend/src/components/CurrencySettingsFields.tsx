"use client"

import { useLocale } from "next-intl"

import { CurrencyMark } from "@/components/CurrencyMark"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  STORE_CURRENCIES,
  currencyLabel,
  defaultSymbolForCurrency,
  symbolsForCurrency,
  type CurrencySymbolId,
  type StoreCurrencyCode,
} from "@/lib/currencies"

export function CurrencySettingsFields({
  currency,
  symbol,
  onCurrencyChange,
  onSymbolChange,
  currencyLabel: currencyFieldLabel,
  symbolLabel,
}: {
  currency: StoreCurrencyCode
  symbol: CurrencySymbolId
  onCurrencyChange: (code: StoreCurrencyCode) => void
  onSymbolChange: (id: CurrencySymbolId) => void
  currencyLabel: string
  symbolLabel: string
}) {
  const locale = useLocale()
  const options = symbolsForCurrency(currency)

  function pickCurrency(code: StoreCurrencyCode) {
    onCurrencyChange(code)
    onSymbolChange(defaultSymbolForCurrency(code))
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>{currencyFieldLabel}</Label>
        <div className="flex flex-wrap gap-2">
          {STORE_CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => pickCurrency(c.code)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm transition-colors",
                currency === c.code
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/50"
              )}
            >
              {currencyLabel(c.code, locale)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <Label>{symbolLabel}</Label>
        <div className="flex flex-wrap gap-2">
          {options.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onSymbolChange(id)}
              aria-pressed={symbol === id}
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-md border bg-background p-2 transition-colors",
                symbol === id
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:bg-muted/40"
              )}
            >
              <CurrencyMark symbol={id} className="h-8" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
