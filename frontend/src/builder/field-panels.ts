import type { FieldDef } from "./types"

export type FieldPanel = "content" | "design" | "settings"

const DESIGN_SWITCHES = new Set(["mobileFullWidth", "fullBleed", "full_width", "motion"])
const DESIGN_NUMBERS = new Set(["mobilePaddingY", "mobileGap", "bgOverlayOpacity"])
const DESIGN_SELECTS = new Set(["desktopWidth", "layout", "tone", "align"])
const SETTINGS_SWITCHES = new Set(["autoplay", "show_placeholder"])
const SETTINGS_SELECTS = new Set(["order_by", "lang"])

export function fieldPanel(field: FieldDef): FieldPanel {
  if (field.panel) return field.panel
  if (field.kind === "color") return "design"
  if (field.kind === "switch" && DESIGN_SWITCHES.has(field.key)) return "design"
  if ((field.kind === "number" || field.kind === "slider") && DESIGN_NUMBERS.has(field.key)) return "design"
  if (field.kind === "select" && DESIGN_SELECTS.has(field.key)) return "design"
  if (field.kind === "media" && field.key === "bgImage") return "design"
  if (field.key === "columns" && (field.kind === "number" || field.kind === "slider" || field.kind === "select")) return "design"
  if (field.kind === "switch" && SETTINGS_SWITCHES.has(field.key)) return "settings"
  if (field.kind === "select" && SETTINGS_SELECTS.has(field.key)) return "settings"
  if (field.kind === "text" && field.key === "anchor_id") return "settings"
  if (field.key === "autoplay" && (field.kind === "number" || field.kind === "slider")) return "settings"
  if (field.key === "limit" && (field.kind === "number" || field.kind === "slider")) return "settings"
  return "content"
}

export function fieldsForPanel(fields: FieldDef[], panel: FieldPanel): FieldDef[] {
  return fields.filter((field) => fieldPanel(field) === panel)
}
