"use client"

import {
  BarChart3,
  BookOpen,
  Bot,
  Briefcase,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  MessageSquareQuote,
  Package,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { useCallback, useMemo } from "react"
import { usePathname } from "next/navigation"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { resolveBusinessPreset } from "@/config/business-presets"

import type { NavMainItem } from "@/components/sidebar-07/nav-main"

type ModRow = {
  slug: string
  enabled: boolean
}

export type NavSection = {
  groupLabel: string
  items: NavMainItem[]
}

const ROUTES: Record<string, { path: string; icon: LucideIcon }> = {
  dashboard: { path: "/admin", icon: LayoutDashboard },
  catalog: { path: "/admin/catalog", icon: Package },
  orders: { path: "/admin/orders", icon: ClipboardList },
  cart: { path: "/admin/cart", icon: ShoppingCart },
  checkout: { path: "/admin/checkout", icon: ShoppingBag },
  rbac: { path: "/admin/users", icon: Users },
  store_settings: { path: "/admin/store-settings", icon: Store },
  inventory: { path: "/admin/inventory", icon: Truck },
  reports: { path: "/admin/reports", icon: BarChart3 },
  marketing: { path: "/admin/marketing", icon: Package },
  cms: { path: "/admin/cms", icon: Package },
  blog: { path: "/admin/blog", icon: BookOpen },
  academy: { path: "/admin/academy", icon: GraduationCap },
  portfolio: { path: "/admin/portfolio", icon: Briefcase },
  announcements: { path: "/admin/announcements", icon: Megaphone },
  testimonials: { path: "/admin/testimonials", icon: MessageSquareQuote },
  team: { path: "/admin/team", icon: Users },
  consultations: { path: "/admin/consultations", icon: MessageSquareQuote },
  accounting: { path: "/admin/accounting", icon: Wallet },
  native_api: { path: "/admin/native-api", icon: Settings },
  ai_recommendations: { path: "/admin/ai", icon: Bot },
  modules: { path: "/admin/modules", icon: Settings },
}

const SECTIONS: { labelKey: string; slugs: string[] }[] = [
  { labelKey: "section_overview", slugs: ["dashboard"] },
  { labelKey: "section_site", slugs: ["blog", "cms", "academy", "portfolio", "announcements", "testimonials", "team", "consultations"] },
  { labelKey: "section_commerce", slugs: ["catalog", "orders", "cart", "checkout"] },
  { labelKey: "section_access", slugs: ["rbac", "store_settings", "modules"] },
  { labelKey: "section_finance", slugs: ["accounting"] },
  { labelKey: "section_phase2", slugs: ["inventory", "reports", "marketing"] },
  { labelKey: "section_phase3", slugs: ["native_api", "ai_recommendations"] },
]

function pathActive(pathname: string, path: string): boolean {
  if (path === "/admin") {
    return pathname === "/admin" || pathname === "/admin/"
  }
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function useDashboardNav() {
  const { t } = useTranslation(["nav"])
  const pathname = usePathname() ?? ""

  const { data: rows = [] } = useQuery({
    queryKey: ["modules"],
    queryFn: () => api<{ data: ModRow[] }>("/api/v1/modules").then((r) => r.data),
  })

  const { data: tenant } = useQuery({
    queryKey: ["tenant"],
    queryFn: () =>
      api<{
        data: {
          theme_preset?: string | null
          business_type_slug?: string | null
          nav_preset?: { preset?: string } | null
        }
      }>("/api/v1/tenant").then((r) => r.data),
  })

  const businessPreset = useMemo(() => {
    const fromNav = tenant?.nav_preset?.preset
    return resolveBusinessPreset(fromNav ?? tenant?.theme_preset, tenant?.business_type_slug)
  }, [tenant])

  const enabledSlugs = useMemo(() => {
    const s = new Set<string>()
    for (const r of rows) {
      if (r.enabled) {
        s.add(r.slug)
      }
    }
    return s
  }, [rows])

  const slugEnabled = useCallback(
    (slug: string): boolean => {
      if (slug === "orders") {
        return enabledSlugs.has("catalog")
      }
      if (slug === "store_settings") {
        return enabledSlugs.has("dashboard")
      }
      return enabledSlugs.has(slug)
    },
    [enabledSlugs],
  )

  const navSections: NavSection[] = useMemo(() => {
    const sections: NavSection[] = []

    for (const sec of SECTIONS) {
      const items: NavMainItem[] = []
      const seen = new Set<string>()

      for (const slug of sec.slugs) {
        if (businessPreset?.hiddenSlugs?.includes(slug)) {
          continue
        }
        if (!slugEnabled(slug)) {
          continue
        }
        const meta = ROUTES[slug]
        if (!meta || seen.has(meta.path)) {
          continue
        }
        seen.add(meta.path)
        items.push({
          title: t(`nav:${slug}` as never),
          url: meta.path,
          icon: meta.icon,
          isActive: pathActive(pathname, meta.path),
        })
      }

      if (items.length > 0) {
        sections.push({
          groupLabel: t(`nav:${sec.labelKey}` as never),
          items,
        })
      }
    }

    return sections
  }, [enabledSlugs, pathname, slugEnabled, t, rows, businessPreset])

  return { navSections }
}
