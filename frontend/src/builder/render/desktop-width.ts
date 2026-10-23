import type { SectionNode, WidgetNode } from "../types"

/** Poetry homepage section widgets that accept `desktopWidth` (full | half | wide | narrow). */
export const DESKTOP_WIDTH_TYPES = new Set([
  "poetry-hero", "poem-list", "book-banner", "occasion-cards", "media-cards", "shop-showcase", "poet-about", "quote-block",
])
export type DesktopWidth = "full" | "half" | "wide" | "narrow"

export function widgetDesktopWidth(w: WidgetNode | undefined): DesktopWidth {
  if (!w || !DESKTOP_WIDTH_TYPES.has(w.type)) return "full"
  const v = (w.props as Record<string, unknown> | undefined)?.desktopWidth
  return v === "half" || v === "wide" || v === "narrow" ? v : "full"
}

/** A section counts as non-full when its only visible content is one desktopWidth widget. */
export function sectionDesktopWidth(s: SectionNode): DesktopWidth {
  if (s.columns.length !== 1) return "full"
  const ws = s.columns[0].widgets.filter((w) => !w.hidden)
  return ws.length === 1 ? widgetDesktopWidth(ws[0]) : "full"
}

/** class for one item in a `.wb-dw-row` */
export const dwClass = (w: DesktopWidth) => (w === "full" ? "" : `wb-dw-item wb-dw-${w}`)
/** data attribute for an item / row wrapper (debuggable in the shipped HTML) */
export const dwAttr = (w: DesktopWidth) => ({ "data-dw": w })
/** row class; in the editor the desktop preview forces the layout regardless of viewport width */
export const dwRowClass = (editor: boolean, device: string) => `wb-dw-row ${editor && device === "desktop" ? "wb-dw-force" : ""} ${editor ? "wb-dw-edit" : ""}`

const DW_PCT: Record<DesktopWidth, number> = { full: 100, half: 50, wide: 60, narrow: 40 }

/**
 * Pack consecutive non-full items into rows whose widths sum to <= 100%.
 * An item left alone in its row (no partner fits) renders full width, so a stray
 * `half` never leaves an empty gap beside it and a pair never gets split by wrap.
 */
export function packDesktopWidths(ws: DesktopWidth[]): DesktopWidth[] {
  const out = [...ws]
  let start = 0
  const flush = (end: number) => {
    if (end - start === 1) out[start] = "full"
    start = end
  }
  let sum = 0
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]
    if (w === "full") { flush(i); start = i + 1; sum = 0; continue }
    if (sum + DW_PCT[w] > 100) { flush(i); sum = 0 }
    sum += DW_PCT[w]
  }
  flush(ws.length)
  return out
}

/** packDesktopWidths over a list where hidden entries are skipped (they keep "full" and don't break a pair). */
export function packVisible<T>(items: T[], width: (x: T) => DesktopWidth, hidden: (x: T) => boolean): DesktopWidth[] {
  const idx = items.map((x, i) => (hidden(x) ? -1 : i)).filter((i) => i >= 0)
  const packed = packDesktopWidths(idx.map((i) => width(items[i])))
  const out: DesktopWidth[] = items.map(() => "full")
  idx.forEach((i, k) => { out[i] = packed[k] })
  return out
}
