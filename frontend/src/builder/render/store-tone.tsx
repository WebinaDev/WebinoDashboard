import type { CSSProperties, ReactNode } from "react"

import { propStr } from "../props"
import { luminance } from "./contrast"
import "./store-tone.css"

/**
 * Theme-driven surface tone for storefront widgets (product detail, gallery, buy box, reviews,
 * questions, attributes, product grids, breadcrumbs …). The wrapper only remaps colour tokens
 * (--sfc-* for the classic components, --color-* for the shared Tailwind ones), so the same widget
 * reads well on a light page, a dark page, or a dark/light glass section on any site.
 *
 * tone: "" | "default" → inherit the theme · "dark" · "glass-dark" · "glass" (light glass).
 * Poetry-style sites that already store `tone: "glass"` with a light ink colour get dark glass.
 */
export const STORE_TONE_TYPES = new Set([
  "product-detail", "product-gallery", "add-to-cart-box", "product-attributes", "product-description",
  "product-stock", "installment-info", "product-reviews", "product-questions", "product-grid",
  "recently-viewed", "breadcrumbs", "most-viewed", "cart-lines",
])

type P = Record<string, unknown>
const light = (c: string) => (luminance(c) ?? 0) > 0.5

export function storeTone(p: P): "" | "dark" | "glass-dark" | "glass" {
  const t = propStr(p, "tone")
  const text = propStr(p, "textColor") || propStr(p, "ink")
  if (t === "dark" || t === "glass-dark") return t
  if (t === "glass") return text && light(text) ? "glass-dark" : "glass"
  return ""
}

function inkFor(bg: string, darkInk: string): string {
  const l = luminance(bg)
  return l != null && l > 0.25 ? darkInk : "#ffffff"
}

export function storeToneStyle(p: P, tone: string): CSSProperties {
  const v: Record<string, string> = {}
  const dark = tone !== "glass"
  const text = propStr(p, "textColor") || propStr(p, "ink")
  // Gold/brand accent: explicit accentColor, else the poetry `gold`, else poetry `accent`.
  const accent = propStr(p, "accentColor") || propStr(p, "gold") || propStr(p, "accent")
  const bg = propStr(p, "glassBg") || (dark ? propStr(p, "card") : "")
  const border = propStr(p, "glassBorder")
  const deep = propStr(p, "accentInk") || "#2a0d18"
  if (text) v["--st-text"] = text
  if (accent) {
    v["--st-accent"] = accent
    v["--st-accent-ink"] = propStr(p, "accentInk") || inkFor(accent, deep)
  }
  if (bg) v["--st-surface"] = bg
  if (border) v["--st-border"] = border
  return v as CSSProperties
}

export function StoreTone({ widget, children }: { widget: { type: string; props: P }; children: ReactNode }) {
  if (!STORE_TONE_TYPES.has(widget.type)) return <>{children}</>
  const tone = storeTone(widget.props)
  if (!tone) return <>{children}</>
  return (
    <div className={`wb-st wb-st-${tone}`} style={storeToneStyle(widget.props, tone)} data-store-tone={tone}>
      {children}
    </div>
  )
}
