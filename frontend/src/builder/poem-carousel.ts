import { parseRows, propNum, propStr } from "./props"

/** Query string for /v1/public/poetry/poems used by poem-carousel (prefetch key must match the hook). */
export function poemCarouselQuery(p: Record<string, unknown>): string {
  const count = Math.min(24, Math.max(1, propNum(p, "count", 8)))
  const qs = new URLSearchParams({ per_page: String(count), with_text: "1" })
  const filter = propStr(p, "filter", "short")
  if (filter === "short") qs.set("flag", "is_short")
  else if (filter === "style") {
    const style = propStr(p, "style").trim()
    if (style) qs.set("style", style)
  }
  if (propStr(p, "sort") === "popular") qs.set("sort", "popular")
  return qs.toString()
}

export function verseLines(raw: { lines?: unknown; stanzas?: Array<{ lines?: unknown }> | null; excerpt?: unknown }): string[] {
  if (Array.isArray(raw.lines)) return raw.lines.map((l) => String(l).trim()).filter(Boolean)
  if (Array.isArray(raw.stanzas)) {
    return raw.stanzas.flatMap((s) => (Array.isArray(s?.lines) ? s.lines : [])).map((l) => String(l).trim()).filter(Boolean)
  }
  return String(raw.excerpt ?? "").split(/\n+/).map((s) => s.trim()).filter(Boolean)
}

export function manualPoemRows(items: unknown): Array<{ title: string; lines: string[]; href: string; tag: string }> {
  return parseRows(items, ["title", "lines", "href", "tag"])
    .map((r) => ({ title: r.title, lines: verseLines({ lines: r.lines.split(/\n+/), excerpt: r.lines }), href: r.href, tag: r.tag }))
    .filter((r) => r.title || r.lines.length)
}
