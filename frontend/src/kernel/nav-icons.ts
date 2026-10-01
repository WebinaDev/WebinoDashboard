import {
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  ClipboardList,
  Coffee,
  CreditCard,
  FileText,
  GraduationCap,
  Images,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  ListTree,
  Megaphone,
  MessageSquareQuote,
  MonitorSmartphone,
  Newspaper,
  Package,
  Palette,
  Percent,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tags,
  Ticket,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

/** Explicit path → icon map (prefer longer / more specific keys). */
const PATH_ICONS: Record<string, LucideIcon> = {
  "": LayoutDashboard,
  dashboard: LayoutDashboard,
  products: Package,
  "products/tags": Tags,
  brands: Store,
  "product-categories": ListTree,
  attributes: Tags,
  "pricing/quick-add": ShoppingBag,
  "pricing/bulk-editor": ClipboardList,
  "pricing/price-changer": Percent,
  orders: Package,
  pos: ShoppingCart,
  cart: ShoppingCart,
  checkout: ShoppingBag,
  users: Users,
  customers: Users,
  staff: Users,
  tickets: Ticket,
  support: MessageSquareQuote,
  themes: Palette,
  modules: Package,
  marketplace: Store,
  media: Images,
  pages: FileText,
  builder: LayoutTemplate,
  "import/wordpress": FileText,
  cms: FileText,
  blog: BookOpen,
  magazine: Newspaper,
  academy: GraduationCap,
  marketing: Megaphone,
  "marketing/coupons": Percent,
  notifications: Megaphone,
  reports: BarChart3,
  analytics: BarChart3,
  menu: UtensilsCrossed,
  reservations: Store,
  resume: Briefcase,
  portfolio: Briefcase,
  team: Users,
  testimonials: MessageSquareQuote,
  announcements: Megaphone,
  consultations: MessageSquareQuote,
  inventory: Truck,
  coffee: Coffee,
  "coffee-profile": Coffee,
  "pay-link": Link2,
  "my-orders": ClipboardList,
  "c2c-receipts": CreditCard,
  "wallet-withdrawals": Wallet,
  c2c: CreditCard,
  wallet: Wallet,
  "ai-content": Sparkles,
  "bots/bale": Bot,
  "bots/telegram": Bot,
  bots: Bot,
  settings: Settings,
  "settings/site": Settings,
  "settings/shop": Store,
  catalog: Package,
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  "nav.group_shop": ShoppingBag,
  "nav.group_magazine": Newspaper,
  "nav.group_bots": Bot,
  group_shop: ShoppingBag,
  group_magazine: Newspaper,
  group_bots: Bot,
}

export function resolveNavIcon(url: string, titleKey?: string): LucideIcon {
  if (titleKey) {
    const g = GROUP_ICONS[titleKey] ?? GROUP_ICONS[titleKey.replace(/^nav\./, "")]
    if (g) return g
  }
  const path = url.replace(/^\/dashboard\/?/, "").replace(/\/+$/, "")
  if (PATH_ICONS[path]) return PATH_ICONS[path]

  const parts = path.split("/").filter(Boolean)
  for (let len = parts.length; len > 0; len -= 1) {
    const key = parts.slice(0, len).join("/")
    if (PATH_ICONS[key]) return PATH_ICONS[key]
  }
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (PATH_ICONS[parts[i]]) return PATH_ICONS[parts[i]]
  }
  return LayoutDashboard
}
