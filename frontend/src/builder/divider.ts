import type { CSSProperties } from "react"
import { propStr } from "./props"

export function dividerStyle(props: Record<string, unknown>): CSSProperties {
  const style: CSSProperties = { borderColor: propStr(props, "color", "var(--color-border)") }
  const thickness = props.dividerThickness
  if (typeof thickness === "number" && Number.isFinite(thickness)) style.borderTopWidth = Math.min(24, Math.max(1, thickness))
  const width = props.dividerWidth
  if (typeof width === "number" && Number.isFinite(width)) style.width = `${Math.min(100, Math.max(1, width))}%`
  const lineStyle = props.dividerLineStyle
  if (lineStyle === "solid" || lineStyle === "dashed" || lineStyle === "dotted" || lineStyle === "double") style.borderTopStyle = lineStyle
  const alignment = props.dividerAlignment
  if (alignment === "start" || alignment === "center" || alignment === "end") {
    style.marginInlineStart = alignment === "start" ? 0 : "auto"
    style.marginInlineEnd = alignment === "end" ? 0 : "auto"
  }
  return style
}
