/** Minimal structural widget contract shared by ERP and Dashboard.
 * Each platform's own WidgetDef/FieldDef is a superset, so shared defs are assignable to it. */
export type SharedOption = { value: string; label: string }
export type SharedRepeaterSubField = {
  key: string
  label: string
  kind: "text" | "url" | "media" | "icon" | "textarea" | "select"
  options?: SharedOption[]
}
export type SharedFieldDef =
  | { kind: "text" | "textarea" | "color" | "url"; key: string; label: string }
  | { kind: "number"; key: string; label: string; min?: number; max?: number }
  | { kind: "select"; key: string; label: string; options: SharedOption[] }
  | { kind: "switch"; key: string; label: string }
  | { kind: "slider"; key: string; label: string; min: number; max: number; step?: number; unit?: string }
  | { kind: "icon"; key: string; label: string; options: SharedOption[] }
  | { kind: "link"; key: string; label: string }
  | { kind: "media"; key: string; label: string; accept?: "image" | "video" | "all" }
  | { kind: "repeater"; key: string; label: string; fields: SharedRepeaterSubField[] }

export type SharedWidgetNode = { id: string; type: string; props: Record<string, unknown> }
export type SharedWidgetCategory = "basic" | "content" | "layout" | "chrome" | "media"
export type SharedWidgetDef = {
  type: string
  label: string
  category: SharedWidgetCategory
  fields: SharedFieldDef[]
  create: () => SharedWidgetNode
}

/** Widget ids both platforms must implement with these props. */
export const SHARED_WIDGET_IDS = [
  "section-heading",
  "steps",
  "icon-cards",
  "badges",
  "cta-banner",
  "comparison-table",
  "form",
  "team-grid",
  "video-embed",
  "audio-block",
  "before-after",
  "lottie",
  "login-form",
  "register-form",
  "section",
  "columns",
  "off-canvas",
  "flex-container",
  "grid-container",
  "site-header",
  "site-footer",
] as const
export type SharedWidgetId = (typeof SHARED_WIDGET_IDS)[number]

/** Shared entrance animation names (platforms map these onto AdvancedProps / CSS). */
export const SHARED_ENTRANCE_ANIMATIONS = [
  "none",
  "fade",
  "slide-up",
  "slide-down",
  "slide-start",
  "slide-end",
  "zoom",
  "flip",
  "bounce",
] as const
export type SharedEntranceAnimation = (typeof SHARED_ENTRANCE_ANIMATIONS)[number]

/** Section/column background video props (platforms already store under advanced.background). */
export type SharedBackgroundVideoProps = {
  video?: string
  poster?: string
  overlay?: string
  overlayOpacity?: number
}
