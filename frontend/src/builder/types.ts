export const BUILDER_VERSION = 1 as const

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
  fullWidth?: boolean
  style?: ResponsiveStyle
  columns: ColumnNode[]
}

export type BuilderDocument = {
  version: typeof BUILDER_VERSION
  sections: SectionNode[]
}

export type RuntimeContext = {
  siteName?: string
  logoUrl?: string | null
  productSlug?: string
  categorySlug?: string
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

export type WidgetCategory = "layout" | "basic" | "commerce" | "chrome"

export type WidgetDef = {
  type: string
  label: string
  category: WidgetCategory
  fields: FieldDef[]
  create: () => WidgetNode
}
