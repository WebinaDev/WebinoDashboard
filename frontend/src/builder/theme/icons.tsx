import {
  Blocks,
  Braces,
  CircleHelp,
  Columns3,
  File,
  FileText,
  GalleryHorizontalEnd,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  Library,
  ListTree,
  MousePointerClick,
  Package,
  Paintbrush,
  Palette,
  PanelBottom,
  PanelTop,
  Search,
  Settings2,
  ShoppingBag,
  Square,
  Type,
  type LucideIcon,
} from "lucide-react"

import type { ThemeKind } from "./context"

const WIDGET_ICONS: Record<string, LucideIcon> = {
  container: Square,
  heading: Heading,
  text: Type,
  image: ImageIcon,
  button: MousePointerClick,
  spacer: Columns3,
  divider: Columns3,
  icon: Palette,
  video: GalleryHorizontalEnd,
  html: Braces,
  menu: ListTree,
  form: FileText,
  "hero-slider": GalleryHorizontalEnd,
  "category-grid": LayoutGrid,
  "product-grid": LayoutGrid,
  "product-card": ShoppingBag,
  "promo-banner": Palette,
  "deal-bar": Palette,
  countdown: CircleHelp,
  "trust-badges": Palette,
  newsletter: FileText,
  "brand-row": ShoppingBag,
  "blog-teasers": Library,
  "filter-panel": Settings2,
  "product-detail": Package,
  "cart-lines": ShoppingBag,
  "checkout": ShoppingBag,
  "checkout-stub": ShoppingBag,
  "account": FileText,
  "account-stub": FileText,
  "store-header": PanelTop,
  "store-footer": PanelBottom,
}

export const THEME_KIND_ICONS: Record<ThemeKind, LucideIcon> = {
  header: PanelTop,
  footer: PanelBottom,
  single_post: FileText,
  single_page: File,
  single_product: Package,
  archive: Library,
  search: Search,
  product_archive: LayoutGrid,
  loop_item: GalleryHorizontalEnd,
  not_found: CircleHelp,
  popup: CircleHelp,
}

export const SETTINGS_SECTION_ICONS = {
  colors: Palette,
  fonts: Type,
  typography: Heading,
  buttons: MousePointerClick,
  images: ImageIcon,
  forms: FileText,
  layout: Columns3,
  lightbox: GalleryHorizontalEnd,
  variables: Braces,
} as const

export function widgetIcon(type: string): LucideIcon {
  return WIDGET_ICONS[type] ?? Blocks
}

export function WidgetGlyph({ type, className = "size-4" }: { type: string; className?: string }) {
  const Icon = widgetIcon(type)
  return <Icon className={className} aria-hidden />
}
