"use client"

/**
 * Mobile quick-access row.
 *
 * A cashier on a tablet has one hand, a drawer that covers the screen, and one job: take
 * the next order. Making them expand «کار روزانه» and scan a list to find the till costs
 * two taps on every single navigation, so the blueprint's highest-priority links are
 * lifted out into a grid of large tap targets at the very top of the drawer.
 *
 * Which links qualify is data, not a hardcoded list: any blueprint group with a
 * `mobilePriority` contributes, lowest number first. Adding a group to the row is one
 * field in `nav-blueprint.ts`.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"

import { pathIsActive } from "@/lib/path-active"
import { cn } from "@/lib/utils"

import type { NavSection } from "@/hooks/useDashboardNav"

/** Cap the row so it can never grow into the second screen it exists to avoid. */
const MAX_LINKS = 6

export function NavMobileQuickAccess({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname() ?? ""

  const links = sections
    .filter((s) => typeof s.mobilePriority === "number")
    .sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99))
    .flatMap((s) => s.items.filter((i) => !i.items?.length))
    .slice(0, MAX_LINKS)

  if (links.length === 0) return null

  return (
    <div className="px-2 pb-2" data-testid="nav-mobile-quick-access">
      <div className="grid grid-cols-3 gap-1.5">
        {links.map((link) => {
          const active = pathIsActive(pathname, link.url)
          const Icon = link.icon
          return (
            <Link
              key={link.url}
              href={link.url}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center",
                "text-[11px] leading-tight transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-accent-foreground/20"
                  : "bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent border-transparent",
              )}
            >
              {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
              <span className="line-clamp-2">{link.title}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
