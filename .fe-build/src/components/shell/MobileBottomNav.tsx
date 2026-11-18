"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { LayoutDashboard, LayoutGrid, Package, ShoppingCart, UsersRound, type LucideIcon } from "lucide-react"

import { DASHBOARD_BASE } from "@/kernel/paths"
import { htmlDir } from "@/lib/locale"
import { cn } from "@/lib/utils"

const ICON_STROKE = 1.75

type Tab = {
  id: string
  href?: string
  labelKey: "home" | "orders" | "products" | "users" | "more"
  icon: LucideIcon
  match?: (path: string) => boolean
  action?: "menu"
}

const TABS: Tab[] = [
  {
    id: "home",
    href: DASHBOARD_BASE,
    labelKey: "home",
    icon: LayoutDashboard,
    match: (p) => (p.replace(/\/+$/, "") || "/") === DASHBOARD_BASE,
  },
  { id: "orders", href: `${DASHBOARD_BASE}/orders`, labelKey: "orders", icon: ShoppingCart, match: (p) => p.startsWith(`${DASHBOARD_BASE}/orders`) },
  { id: "products", href: `${DASHBOARD_BASE}/products`, labelKey: "products", icon: Package, match: (p) => p.startsWith(`${DASHBOARD_BASE}/products`) },
  { id: "users", href: `${DASHBOARD_BASE}/users`, labelKey: "users", icon: UsersRound, match: (p) => p.startsWith(`${DASHBOARD_BASE}/users`) },
  { id: "more", labelKey: "more", icon: LayoutGrid, action: "menu" },
]

type Props = {
  moreOpen?: boolean
  onMoreOpenChange?: (open: boolean) => void
}

/** ERP-style bottom tab bar (mobile only, hidden at md+). */
export function MobileBottomNav({ moreOpen = false, onMoreOpenChange }: Props) {
  const t = useTranslations("shell.mobileNav")
  const locale = useLocale()
  const path = usePathname() ?? "/"

  return (
    <nav className="wd-mobile-tabbar md:hidden" aria-label={t("aria")} dir={htmlDir(locale)}>
      {TABS.map((tab) => {
        const Icon = tab.icon
        const active = tab.action === "menu" ? moreOpen : Boolean(tab.match?.(path))
        const label = t(tab.labelKey)
        const inner = (
          <>
            <span className="wd-mobile-tab-ic">
              <Icon absoluteStrokeWidth strokeWidth={ICON_STROKE} />
            </span>
            <span className="wd-mobile-tab-label">{label}</span>
          </>
        )
        if (tab.action === "menu") {
          return (
            <button
              key={tab.id}
              type="button"
              className={cn("wd-mobile-tab", active && "on")}
              onClick={() => onMoreOpenChange?.(!moreOpen)}
              aria-label={label}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              {inner}
            </button>
          )
        }
        return (
          <Link
            key={tab.id}
            href={tab.href ?? DASHBOARD_BASE}
            className={cn("wd-mobile-tab", active && "on")}
            aria-current={active ? "page" : undefined}
            onClick={() => moreOpen && onMoreOpenChange?.(false)}
          >
            {inner}
          </Link>
        )
      })}
    </nav>
  )
}
