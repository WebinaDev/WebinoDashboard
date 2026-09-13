"use client"

import {
  BarChart3,
  BookOpen,
  Briefcase,
  ClipboardList,
  Coffee,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Link2,
  ListTree,
  Megaphone,
  MessageSquareQuote,
  MonitorSmartphone,
  Package,
  Palette,
  Percent,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { pathIsActive } from "@/lib/path-active"
import { buildAdminNav } from "@/kernel/route-resolver"
import type { TenantActivation } from "@/kernel/types"

import type { NavMainItem } from "@/components/sidebar-07/nav-main"

export type NavSection = {
  groupLabel: string
  items: NavMainItem[]
}

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  catalog: Package,
  products: Package,
  brands: Store,
  "product-categories": ListTree,
  attributes: Tags,
  "quick-add": ShoppingBag,
  "bulk-editor": ClipboardList,
  "price-changer": Percent,
  settings: Settings,
  orders: ClipboardList,
  cart: ShoppingCart,
  checkout: ShoppingBag,
  users: Users,
  customers: Users,
  themes: Palette,
  modules: Settings,
  media: Package,
  cms: Package,
  blog: BookOpen,
  marketing: Package,
  reports: BarChart3,
  magazine: BookOpen,
  academy: GraduationCap,
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
  pos: MonitorSmartphone,
  "pay-link": Link2,
  "my-orders": ClipboardList,
  "c2c-receipts": CreditCard,
  "wallet-withdrawals": Wallet,
  c2c: CreditCard,
  wallet: Wallet,
}

function resolveNavIcon(url: string): LucideIcon {
  const parts = url.split("/").filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const icon = ICONS[parts[i]]
    if (icon) return icon
  }
  return LayoutDashboard
}

export function useDashboardNav() {
  const t = useTranslations("nav")
  const pathname = usePathname() ?? ""

  const { data: activations = [] } = useQuery({
    queryKey: ["kernel-activations"],
    queryFn: () => api<TenantActivation[]>("/api/v1/kernel/activations"),
  })

  const navSections: NavSection[] = useMemo(() => {
    const sections = buildAdminNav(activations)
    return sections.map((sec) => ({
      groupLabel: t(sec.labelKey.replace("nav.", "") as never),
      items: sec.items.map((item) => {
        const Icon = resolveNavIcon(item.url)
        return {
          id: item.url,
          title: t(item.titleKey.replace("nav.", "") as never),
          url: item.url,
          icon: Icon,
          isActive: pathIsActive(pathname, item.url),
        }
      }),
    }))
  }, [activations, pathname, t])

  return { navSections, activations }
}
