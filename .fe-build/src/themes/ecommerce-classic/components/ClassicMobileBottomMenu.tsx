"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { useClassicThemeSettings } from "@/themes/shared/site-branding-context"

export function ClassicMobileBottomMenu() {
  const theme = useClassicThemeSettings()
  const general = theme.general ?? {}
  const pathname = usePathname()
  if (general.mobile_bottom_menu_enabled === false) return null
  const items = Array.isArray(general.mobile_bottom_menu) ? general.mobile_bottom_menu : []
  if (!items.length) return null

  return (
    <nav className="sfc-bottom-menu md:hidden" aria-label="منوی پایین موبایل">
      {items.map((item, index) => {
        const href = String(item.href ?? "/")
        const active = pathname === href || (href !== "/" && pathname.startsWith(href))
        return (
          <Link key={`${href}-${index}`} href={href} className={active ? "is-active" : undefined}>
            <span>{String(item.label ?? "")}</span>
          </Link>
        )
      })}
    </nav>
  )
}
