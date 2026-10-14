import type { CSSProperties } from "react"

import { safeClass } from "./ids"
import type { AdvancedProps, BuilderDocument, DeviceMode, ResponsiveStyle, SectionNode, StyleProps, WidgetNode } from "./types"

function safeValue(value: string | undefined): string | undefined {
  if (!value) return undefined
  const cleaned = value.replace(/[{}<>;]/g, "").trim()
  return cleaned.slice(0, 80) || undefined
}

export function mergeStyle(style: ResponsiveStyle | undefined, device: DeviceMode): StyleProps {
  if (!style) return {}
  if (device === "desktop") return { ...(style.base ?? {}) }
  if (device === "tablet") return { ...(style.base ?? {}), ...(style.tablet ?? {}) }
  return { ...(style.base ?? {}), ...(style.tablet ?? {}), ...(style.mobile ?? {}) }
}

export function styleToCss(style: StyleProps): CSSProperties {
  const align = style.textAlign
  return {
    marginTop: safeValue(style.margin?.top),
    marginRight: safeValue(style.margin?.right),
    marginBottom: safeValue(style.margin?.bottom),
    marginLeft: safeValue(style.margin?.left),
    paddingTop: safeValue(style.padding?.top),
    paddingRight: safeValue(style.padding?.right),
    paddingBottom: safeValue(style.padding?.bottom),
    paddingLeft: safeValue(style.padding?.left),
    color: safeValue(style.color),
    fontSize: safeValue(style.fontSize),
    fontWeight: safeValue(style.fontWeight),
    lineHeight: safeValue(style.lineHeight),
    textAlign: align,
    background: safeValue(style.background),
    backgroundImage: style.backgroundImage
      ? `url("${safeValue(style.backgroundImage) ?? ""}")`
      : undefined,
    backgroundSize: style.backgroundImage ? "cover" : undefined,
    backgroundPosition: style.backgroundImage ? "center" : undefined,
    borderWidth: safeValue(style.borderWidth),
    borderStyle: style.borderStyle,
    borderColor: safeValue(style.borderColor),
    borderRadius: safeValue(style.radius),
    minHeight: safeValue(style.minHeight),
    maxWidth: safeValue(style.maxWidth),
    gap: safeValue(style.gap),
    letterSpacing: safeValue(style.letterSpacing),
    textTransform: style.textTransform && style.textTransform !== "none" ? style.textTransform : undefined,
    boxShadow: safeValue(style.boxShadow),
    opacity: safeValue(style.opacity),
    width: safeValue(style.width),
    order: safeValue(style.order) as CSSProperties["order"],
    display: style.hidden ? "none" : undefined,
  }
}

function gridTemplate(value: string | undefined): string | undefined {
  const v = safeValue(value)
  if (!v) return undefined
  if (/^\d{1,2}$/.test(v)) return `repeat(${Math.min(24, Math.max(1, Number(v)))}, minmax(0, 1fr))`
  return v
}

/** True when the node defines its own children layout (overrides the 12-column grid). */
export function hasCustomLayout(style: StyleProps | undefined): boolean {
  return Boolean(style?.display)
}

/** CSS for the element that holds a node's children (section → .wb-columns, column → .wb-col-body). */
export function layoutToCss(style: StyleProps): CSSProperties {
  if (!style.display && !style.rowGap && !style.columnGap) return {}
  const display = style.display
  return {
    display,
    flexDirection: display === "flex" ? style.flexDirection : undefined,
    flexWrap: display === "flex" ? style.flexWrap : undefined,
    justifyContent: display === "flex" || display === "grid" ? style.justifyContent : undefined,
    alignItems: display === "flex" || display === "grid" ? style.alignItems : undefined,
    gridTemplateColumns: display === "grid" ? gridTemplate(style.gridColumns) : undefined,
    gridTemplateRows: display === "grid" ? gridTemplate(style.gridRows) : undefined,
    rowGap: safeValue(style.rowGap),
    columnGap: safeValue(style.columnGap),
  }
}

function cssDecl(css: CSSProperties): string {
  return Object.entries(css)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => {
      const prop = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      return `${prop}:${String(value)}`
    })
    .join(";")
}

function decl(style: StyleProps | undefined): string {
  return style ? cssDecl(styleToCss(style)) : ""
}

function layoutDecl(style: StyleProps | undefined): string {
  if (!style) return ""
  const css = cssDecl(layoutToCss(style))
  // Children of a custom flex/grid container must not keep their 12-column spans.
  return css
}

const MEDIA = { tablet: "@media (max-width:1024px)", mobile: "@media (max-width:767px)" } as const

function pushLayout(rules: string[], id: string, child: string, style: ResponsiveStyle | undefined) {
  if (!style) return
  const sel = `.${safeClass(id)} > ${child}`
  const parts: Array<[string, StyleProps | undefined]> = [["", style.base], [MEDIA.tablet, style.tablet], [MEDIA.mobile, style.mobile]]
  for (const [media, s] of parts) {
    const body = layoutDecl(s)
    const reset = s?.display ? `${sel} > *{grid-column:auto}` : ""
    const block = [body ? `${sel}{${body}}` : "", reset].filter(Boolean).join("")
    if (block) rules.push(media ? `${media}{${block}}` : block)
  }
}

function pushSpans(rules: string[], section: SectionNode) {
  // v2 sections: real per-breakpoint spans (legacy sections keep inline desktop spans).
  for (const column of section.columns) {
    const cls = safeClass(column.id)
    const d = spanFor(column.span, column.tabletSpan, column.mobileSpan, "desktop")
    const t = spanFor(column.span, column.tabletSpan, column.mobileSpan, "tablet")
    const m = spanFor(column.span, column.tabletSpan, column.mobileSpan, "mobile")
    rules.push(`.${cls}{grid-column:span ${d}}`)
    if (t !== d) rules.push(`${MEDIA.tablet}{.${cls}{grid-column:span ${t}}}`)
    if (m !== t) rules.push(`${MEDIA.mobile}{.${cls}{grid-column:span ${m}}}`)
  }
}

function pushNode(rules: string[], id: string, style: ResponsiveStyle | undefined) {
  if (!style) return
  const cls = safeClass(id)
  const base = decl(style.base)
  const tablet = decl(style.tablet)
  const mobile = decl(style.mobile)
  if (base) rules.push(`.${cls}{${base}}`)
  if (tablet) rules.push(`${MEDIA.tablet}{.${cls}{${tablet}}}`)
  if (mobile) rules.push(`${MEDIA.mobile}{.${cls}{${mobile}}}`)
}

/** Extra classes/id from the Advanced tab, sanitised for attribute use. */
export function advancedClass(advanced: AdvancedProps | undefined): string {
  if (!advanced) return ""
  const extra = (advanced.cssClass ?? "")
    .split(/\s+/)
    .map((c) => c.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean)
    .slice(0, 8)
  const anim = advanced.animation && advanced.animation !== "none" ? [`wb-anim-${advanced.animation}`] : []
  return [...extra, ...anim].join(" ")
}

export function advancedId(advanced: AdvancedProps | undefined): string | undefined {
  const id = (advanced?.cssId ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
  return id || undefined
}

function pushVisibility(rules: string[], id: string, advanced: AdvancedProps | undefined) {
  const hide = advanced?.hideOn
  if (!hide) return
  const cls = safeClass(id)
  if (hide.desktop) rules.push(`@media (min-width:1025px){.${cls}{display:none!important}}`)
  if (hide.tablet) rules.push(`@media (min-width:768px) and (max-width:1024px){.${cls}{display:none!important}}`)
  if (hide.mobile) rules.push(`@media (max-width:767px){.${cls}{display:none!important}}`)
}

function walkWidgets(rules: string[], widgets: WidgetNode[]) {
  for (const widget of widgets) {
    pushNode(rules, widget.id, widget.style)
    pushVisibility(rules, widget.id, widget.advanced)
    if (widget.children) walkSections(rules, widget.children)
  }
}

function walkSections(rules: string[], sections: SectionNode[]) {
  for (const section of sections) {
    pushNode(rules, section.id, section.style)
    if (!section.legacy) {
      pushSpans(rules, section)
      pushLayout(rules, section.id, ".wb-columns", section.style)
    }
    for (const column of section.columns) {
      pushNode(rules, column.id, column.style)
      if (!section.legacy) pushLayout(rules, column.id, ".wb-col-body", column.style)
      walkWidgets(rules, column.widgets)
    }
  }
}

export function documentCss(document: BuilderDocument): string {
  const rules: string[] = []
  walkSections(rules, document.sections)
  return rules.join("\n")
}

export function spanFor(span: number, tabletSpan: number | undefined, mobileSpan: number | undefined, device: DeviceMode): number {
  if (device === "mobile") return Math.min(12, Math.max(1, mobileSpan ?? 12))
  if (device === "tablet") return Math.min(12, Math.max(1, tabletSpan ?? span))
  return Math.min(12, Math.max(1, span))
}
