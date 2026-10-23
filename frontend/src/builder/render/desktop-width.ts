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
/** row class; in the editor the desktop preview forces the layout regardless of viewport width */
export const dwRowClass = (editor: boolean, device: string) => `wb-dw-row ${editor && device === "desktop" ? "wb-dw-force" : ""} ${editor ? "wb-dw-edit" : ""}`
