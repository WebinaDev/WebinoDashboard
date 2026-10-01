import type { CSSProperties } from "react"

import { safeClass } from "./ids"
import type { BuilderDocument, DeviceMode, ResponsiveStyle, SectionNode, StyleProps, WidgetNode } from "./types"

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
    display: style.hidden ? "none" : undefined,
  }
}

function decl(style: StyleProps | undefined): string {
  if (!style) return ""
  const css = styleToCss(style)
  return Object.entries(css)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => {
      const prop = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      return `${prop}:${String(value)}`
    })
    .join(";")
}

function pushNode(rules: string[], id: string, style: ResponsiveStyle | undefined) {
  if (!style) return
  const cls = safeClass(id)
  const base = decl(style.base)
  const tablet = decl(style.tablet)
  const mobile = decl(style.mobile)
  if (base) rules.push(`.${cls}{${base}}`)
  if (tablet) rules.push(`@media (max-width:1024px){.${cls}{${tablet}}}`)
  if (mobile) rules.push(`@media (max-width:767px){.${cls}{${mobile}}}`)
}

function walkWidgets(rules: string[], widgets: WidgetNode[]) {
  for (const widget of widgets) {
    pushNode(rules, widget.id, widget.style)
    if (widget.children) walkSections(rules, widget.children)
  }
}

function walkSections(rules: string[], sections: SectionNode[]) {
  for (const section of sections) {
    pushNode(rules, section.id, section.style)
    for (const column of section.columns) {
      pushNode(rules, column.id, column.style)
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
