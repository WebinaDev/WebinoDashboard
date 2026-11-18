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

/**
 * Currency glyphs are masked so fill follows `currentColor` (headers, muted
 * text, buttons, tables) instead of the baked-in navy from the source SVG.
 */
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
    <span
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={cn(
        "inline-block aspect-[1.1] h-[1em] shrink-0 bg-current align-[-0.125em]",
        className,
      )}
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  )
}
