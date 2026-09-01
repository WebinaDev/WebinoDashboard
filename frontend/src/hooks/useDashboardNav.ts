"use client"

import {
  BarChart3,
  BookOpen,
  Briefcase,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  MessageSquareQuote,
  Package,
  Palette,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react"
import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
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
  orders: ClipboardList,
  cart: ShoppingCart,
  checkout: ShoppingBag,
  users: Users,
  customers: Users,
  settings: Settings,
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
}

function pathActive(pathname: string, path: string): boolean {
  if (path === "/admin") {
    return pathname === "/admin" || pathname === "/admin/"
  }
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function useDashboardNav() {
  const t = useTranslations("nav")
  const pathname = usePathname() ?? ""

  const { data: activations = [] } = useQuery({
    queryKey: ["kernel-activations"],
    queryFn: () =>
      api<TenantActivation[]>("/api/v1/kernel/activations"),
  })

  const navSections: NavSection[] = useMemo(() => {
    const sections = buildAdminNav(activations)
    return sections.map((sec) => ({
      groupLabel: t(sec.labelKey.replace("nav.", "") as never),
      items: sec.items.map((item) => {
        const iconKey = item.url.split("/").pop() ?? "dashboard"
        const Icon = ICONS[iconKey] ?? LayoutDashboard
        return {
          title: t(item.titleKey.replace("nav.", "") as never),
          url: item.url,
          icon: Icon,
          isActive: pathActive(pathname, item.url),
        }
      }),
    }))
  }, [activations, pathname, t])

  return { navSections }
}
