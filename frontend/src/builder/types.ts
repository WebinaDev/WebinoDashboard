/** v2: sections may use flex/grid layout and per-breakpoint spans; v1 sections are kept as `legacy`. */
export const BUILDER_VERSION = 2 as const

export type DeviceMode = "desktop" | "tablet" | "mobile"

export type BoxEdges = {
  top?: string
  right?: string
  bottom?: string
  left?: string
}

export type StyleProps = {
  margin?: BoxEdges
  padding?: BoxEdges
  color?: string
  fontSize?: string
  fontWeight?: string
  lineHeight?: string
  textAlign?: "start" | "center" | "end"
  background?: string
  backgroundImage?: string
  borderWidth?: string
  borderStyle?: "none" | "solid" | "dashed"
  borderColor?: string
  radius?: string
  minHeight?: string
  maxWidth?: string
  gap?: string
  hidden?: boolean
  letterSpacing?: string
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"
  boxShadow?: string
  opacity?: string
  width?: string
  /* Layout of the node's children (section → its columns, column → its widgets). Per breakpoint. */
  display?: "grid" | "flex" | "block"
  flexDirection?: "row" | "row-reverse" | "column" | "column-reverse"
  flexWrap?: "nowrap" | "wrap" | "wrap-reverse"
  justifyContent?: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly" | "stretch"
  alignItems?: "start" | "center" | "end" | "stretch" | "baseline"
  /** Grid columns: a count ("3") or a template ("2fr 1fr"). */
  gridColumns?: string
  gridRows?: string
  rowGap?: string
  columnGap?: string
  /** Order of this node inside its parent (e.g. reorder columns on mobile). */
  order?: string
}

/** Elementor-style "Advanced" settings that are not per-device styles. */
export type AdvancedProps = {
  /** Extra CSS classes (sanitised to [a-zA-Z0-9_- ]). */
  cssClass?: string
  /** HTML id for anchors (sanitised). */
  cssId?: string
  /** Hide on specific devices (independent of the device being edited). */
  hideOn?: { desktop?: boolean; tablet?: boolean; mobile?: boolean }
  /** Simple entrance animation. */
  animation?: "none" | "fade" | "slide-up" | "zoom"
}

export type ResponsiveStyle = {
  base?: StyleProps
  tablet?: StyleProps
  mobile?: StyleProps
}

export type WidgetNode = {
  id: string
  type: string
  props: Record<string, unknown>
  style?: ResponsiveStyle
  advanced?: AdvancedProps
  /** Nested sections for the container widget. */
  children?: SectionNode[]
}

export type ColumnNode = {
  id: string
  span: number
  tabletSpan?: number
  mobileSpan?: number
  style?: ResponsiveStyle
  widgets: WidgetNode[]
}

export type SectionNode = {
  id: string
  /** Set by the v1→v2 migration: keep the old fixed 12-column rendering exactly. */
  legacy?: boolean
  fullWidth?: boolean
  style?: ResponsiveStyle
  columns: ColumnNode[]
}

export type BuilderDocument = {
  version: 1 | typeof BUILDER_VERSION
  sections: SectionNode[]
  /** Extra CSS from an imported Elementor document. Node styles stay in `style`. */
  css?: string
  source?: string
  page_settings?: Record<string, unknown>
}

export type RuntimeContext = {
  siteName?: string
  logoUrl?: string | null
  productSlug?: string
  /** Blog post slug on single-post theme templates. */
  postSlug?: string
  categorySlug?: string
  /** Active storefront theme slug — drives DocumentView skin class. */
  themeSlug?: string | null
  /** Published loop-item template rendered inside product grids. */
  loopDocument?: BuilderDocument
}

export type EditorApi = {
  selectedId: string | null
  onSelect: (id: string) => void
  onInline: (id: string, key: string, value: string) => void
  onDropNew: (columnId: string, index: number, type: string) => void
  onDropMove: (columnId: string, index: number, nodeId: string) => void
  onResize: (columnId: string, span: number) => void
}

export const DND_WIDGET = "application/x-webino-widget"
export const DND_NODE = "application/x-webino-node"

export type FieldDef =
  | { kind: "text" | "textarea" | "color" | "url"; key: string; label: string }
  | { kind: "number"; key: string; label: string; min?: number; max?: number }
  | { kind: "select"; key: string; label: string; options: { value: string; label: string }[] }
  | { kind: "switch"; key: string; label: string }
  /** Media library picker; stores the URL string. */
  | { kind: "media"; key: string; label: string; accept?: "image" | "video" | "all" }
  /** Icon picker; stores the icon key. */
  | { kind: "icon"; key: string; label: string; options: { value: string; label: string }[] }
  /** Link: URL string in `key`, plus `${key}NewTab` / `${key}Nofollow` booleans (backward compatible). */
  | { kind: "link"; key: string; label: string }
  | { kind: "slider"; key: string; label: string; min: number; max: number; step?: number; unit?: string }
  | { kind: "date" | "time" | "datetime"; key: string; label: string }
  /** Array of objects; legacy `label|href` line strings are read through `parseRows`. */
  | { kind: "repeater"; key: string; label: string; fields: RepeaterSubField[] }

export type RepeaterSubField = { key: string; label: string; kind: "text" | "url" | "media" | "icon" | "textarea"; options?: { value: string; label: string }[] }

export type WidgetCategory = "layout" | "basic" | "commerce" | "chrome" | "parts"

export type WidgetDef = {
  type: string
  label: string
  category: WidgetCategory
  fields: FieldDef[]
  create: () => WidgetNode
}
