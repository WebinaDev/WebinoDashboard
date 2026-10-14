/** Accessibility audit for builder documents (pure; used by the editor panel and tests). */
import type { BuilderDocument, SectionNode, WidgetNode } from "./types"

export type A11yIssue = { id: string; severity: "error" | "warning"; code: A11yCode; detail?: string }
export type A11yCode =
  | "img_alt"
  | "heading_multiple_h1"
  | "heading_skip"
  | "heading_empty"
  | "button_text"
  | "link_text"
  | "contrast"
  | "form_label"
  | "video_captions"
  | "no_h1"

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function hexToRgb(value: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!m) return null
  const hex = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

/** WCAG contrast ratio of two hex colours, or null when either is not a plain hex colour. */
export function contrastRatio(fg: string, bg: string): number | null {
  const a = hexToRgb(fg)
  const b = hexToRgb(bg)
  if (!a || !b) return null
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

function eachWidget(sections: SectionNode[], visit: (widget: WidgetNode, bg: string | undefined) => void, bg?: string) {
  for (const section of sections) {
    if (section.hidden) continue
    const sectionBg = section.style?.base?.background ?? bg
    for (const column of section.columns) {
      if (column.hidden) continue
      const columnBg = column.style?.base?.background ?? sectionBg
      for (const widget of column.widgets) {
        if (widget.hidden) continue
        visit(widget, columnBg)
        if (widget.children?.length) eachWidget(widget.children, visit, widget.style?.base?.background ?? columnBg)
      }
    }
  }
}

export function auditDocument(document: BuilderDocument): A11yIssue[] {
  const issues: A11yIssue[] = []
  let lastLevel = 0
  let h1 = 0
  eachWidget(document.sections, (widget, inheritedBg) => {
    const p = widget.props ?? {}
    switch (widget.type) {
      case "image":
        if (str(p.src) && !str(p.alt) && p.decorative !== true) issues.push({ id: widget.id, severity: "error", code: "img_alt" })
        break
      case "image-box":
        if (str(p.image) && !str(p.alt)) issues.push({ id: widget.id, severity: "error", code: "img_alt" })
        break
      case "heading": {
        const level = Number(/^h([1-6])$/.exec(str(p.tag) || "h2")?.[1] ?? 2)
        if (!str(p.text)) issues.push({ id: widget.id, severity: "warning", code: "heading_empty" })
        if (level === 1) {
          h1 += 1
          if (h1 > 1) issues.push({ id: widget.id, severity: "warning", code: "heading_multiple_h1" })
        }
        if (lastLevel && level > lastLevel + 1) issues.push({ id: widget.id, severity: "warning", code: "heading_skip", detail: `h${lastLevel} → h${level}` })
        lastLevel = level
        break
      }
      case "button":
        if (!str(p.label) && !str(p.ariaLabel)) issues.push({ id: widget.id, severity: "error", code: "button_text" })
        break
      case "link":
      case "text-link":
        if (!str(p.label) && !str(p.text)) issues.push({ id: widget.id, severity: "error", code: "link_text" })
        break
      case "video":
        if (str(p.src) && !str(p.captions) && !/youtube|aparat|vimeo/.test(str(p.src))) issues.push({ id: widget.id, severity: "warning", code: "video_captions" })
        break
      case "form":
        // Labels fall back to the technical field name; flag those so a human label is written.
        str(p.fields).split(/\r?\n/).forEach((line, index) => {
          const [label = "", name = ""] = line.split("|").map((part) => part.trim())
          if (line.trim() && !label) issues.push({ id: widget.id, severity: "warning", code: "form_label", detail: name || String(index + 1) })
        })
        break
      default:
        break
    }
    const fg = widget.style?.base?.color
    const bg = widget.style?.base?.background ?? inheritedBg
    if (fg && bg) {
      const ratio = contrastRatio(fg, bg)
      if (ratio !== null && ratio < 4.5) issues.push({ id: widget.id, severity: "warning", code: "contrast", detail: ratio.toFixed(2) })
    }
  })
  if (h1 === 0 && document.sections.length) issues.push({ id: "", severity: "warning", code: "no_h1" })
  return issues
}
