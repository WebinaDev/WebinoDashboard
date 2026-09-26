"use client"

import { cn } from "@/lib/utils"
import {
  CURRENCY_SYMBOL_FILES,
  type CurrencySymbolId,
} from "@/lib/currencies"

const KNOWN: CurrencySymbolId[] = [
  "default",
  "toman-1",
  "toman-2",
  "rial-1",
  "rial-2",
]

export function CurrencyMark({
  symbol = "default",
  className,
  alt = "",
}: {
  symbol?: CurrencySymbolId | string | null
  className?: string
  alt?: string
}) {
  const id = KNOWN.includes(symbol as CurrencySymbolId)
    ? (symbol as CurrencySymbolId)
    : "default"
  const src = CURRENCY_SYMBOL_FILES[id]

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={cn("inline-block h-[1em] w-auto align-[-0.15em]", className)}
      draggable={false}
    />
  )
}
