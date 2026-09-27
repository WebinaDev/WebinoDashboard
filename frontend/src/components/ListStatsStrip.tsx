"use client"

import { useLocale } from "next-intl"

import { MoneyDisplay } from "@/components/currency/MoneyDisplay"
import { Card, CardContent } from "@/components/ui/card"
import { formatNumber, normalizeUiLocale } from "@/lib/locale"
import { cn } from "@/lib/utils"

export type ListStatItem = {
  id: string
  label: string
  value: number | string
  /** Render `value` as store money (`*_minor` display units). */
  money?: boolean
}

export function ListStatsStrip({
  items,
  currency,
  className,
}: {
  items: ListStatItem[]
  currency?: string | null
  className?: string
}) {
  const locale = normalizeUiLocale(useLocale())
  if (!items.length) return null
  const cols =
    items.length <= 3 ? "md:grid-cols-3" : items.length <= 4 ? "md:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3 xl:grid-cols-6"
  const valueClass = "text-base font-semibold tracking-tight sm:text-lg"

  return (
    <div className={cn("flex gap-2.5 overflow-x-auto pb-1 md:grid md:overflow-visible md:pb-0", cols, className)}>
      {items.map((item) => (
        <Card key={item.id} variant="stat" className="wd-mini-tint min-w-[9.5rem] shrink-0 overflow-hidden md:min-w-0">
          <CardContent className="space-y-1 pt-3.5 pb-3">
            <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{item.label}</p>
            {item.money ? (
              <MoneyDisplay amount={item.value} currency={currency} amountClassName={valueClass} />
            ) : (
              <p className={valueClass}>
                {typeof item.value === "number" ? formatNumber(item.value, locale) : item.value}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
