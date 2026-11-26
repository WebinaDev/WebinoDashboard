"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { pathIsActive } from "@/lib/path-active"
import { resolveNavGroupIcon, resolveNavIcon } from "@/kernel/nav-icons"
import { groupDefaultOpenForRole, groupVisibleForRole } from "@/kernel/nav-blueprint"
import { buildAdminNav } from "@/kernel/route-resolver"
import type { TenantActivation } from "@/kernel/types"
import { STAFF_ROLES, useAuthUser, userHasCapability } from "@/components/PermissionGate"
import { useBootstrapQuery } from "@/hooks/useBootstrapQuery"

import type { NavMainItem } from "@/components/sidebar-07/nav-main"
import type { LucideIcon } from "lucide-react"

export type NavSection = {
  /** Blueprint group key; stable across renders, used as the React key and for a11y. */
  groupKey: string
  groupLabel: string
  items: NavMainItem[]
  icon: LucideIcon
  collapsible: boolean
  /** Start expanded for the signed-in role. */
  defaultOpen: boolean
  /** Lower sorts first in the mobile quick-access row. */
  mobilePriority?: number
}

type MenuAclEntry = { menu_key: string; allowed: boolean }

function isCustomerPortalUrl(url: string): boolean {
  return url === "/dashboard/account" || url.startsWith("/dashboard/account/")
}

function menuAllowed(menuKey: string | undefined, acl: MenuAclEntry[] | undefined): boolean {
  if (!menuKey || !acl?.length) return true
  const hit = acl.find((e) => e.menu_key === menuKey)
  if (!hit) return true
  return hit.allowed
}

export function useDashboardNav() {
  const t = useTranslations("nav")
  const pathname = usePathname() ?? ""
  const authQ = useAuthUser()
  const bootstrapQ = useBootstrapQuery()

  const { data: activationsRaw, isLoading } = useQuery({
    queryKey: ["kernel-activations"],
    queryFn: () => api<TenantActivation[]>("/api/v1/kernel/activations"),
  })

  // `= []` on the destructure only covers `undefined`. A backend hiccup can answer with an
  // object (error envelope, `{activations: []}`), and buildAdminNav then throws
  // "e.some is not a function" and takes the whole shell — and every dashboard page with
  // it — down to the route error boundary. Normalise instead of trusting the shape.
  const activations: TenantActivation[] = (() => {
    if (Array.isArray(activationsRaw)) return activationsRaw
    const nested = (activationsRaw as unknown as { activations?: unknown } | undefined)?.activations
    if (Array.isArray(nested)) return nested as TenantActivation[]
    return []
  })()

  const capabilities = authQ.data?.capabilities ?? bootstrapQ.data?.user?.capabilities
  const roleAcl = bootstrapQ.data?.menu_acl
  const role = authQ.data?.role ?? ""
  const hidePortal = (STAFF_ROLES as readonly string[]).includes(role)
  const siteType = bootstrapQ.data?.tenant?.site_type_slug ?? null

  const navSections: NavSection[] = useMemo(() => {
    const sections = buildAdminNav(activations)
    const result: NavSection[] = []

    for (const sec of sections) {
      // Role scoping is a second gate on top of capabilities: capabilities say what a user
      // may *do*, the blueprint says what they should have to *look at*. A cook holds
      // kitchen capabilities, not a 200-link sidebar.
      if (!groupVisibleForRole(sec, role)) continue

      const items: NavMainItem[] = []
      for (const item of sec.items) {
        if (item.roles?.length && !item.roles.includes(role as never)) continue
        if (item.hideFrom?.length && role && item.hideFrom.includes(role as never)) continue
        if (item.moduleSlug === "coffee-profile" && siteType !== "coffee") continue
        if (hidePortal && isCustomerPortalUrl(item.url)) continue
        if (item.capability && !userHasCapability(capabilities, item.capability)) continue
        if (!menuAllowed(item.menuKey, roleAcl)) continue

        const nested =
          item.items
            ?.filter((child) => {
              if (child.roles?.length && !child.roles.includes(role as never)) return false
              if (child.hideFrom?.length && role && child.hideFrom.includes(role as never)) return false
              if (child.capability && !userHasCapability(capabilities, child.capability)) return false
              if (!menuAllowed(child.menuKey, roleAcl)) return false
              return true
            })
            .map((child) => ({
              id: child.url,
              title: t(child.titleKey.replace("nav.", "") as never),
              url: child.url,
              icon: resolveNavIcon(child.url, child.titleKey),
            })) ?? undefined

        if (item.items?.length && (!nested || nested.length === 0)) continue

        items.push({
          id: item.url,
          title: t(item.titleKey.replace("nav.", "") as never),
          url: item.url,
          icon: resolveNavIcon(item.url, item.titleKey),
          isActive:
            pathIsActive(pathname, item.url) ||
            Boolean(nested?.some((n) => pathIsActive(pathname, n.url))),
          items: nested,
        })
      }
      if (items.length === 0) continue

      const groupKey = sec.groupKey ?? sec.section
      const groupLabel = t(sec.labelKey.replace("nav.", "") as never)
      const groupIcon = resolveNavGroupIcon(sec.icon ?? "overview")

      // The heading above is a label, not a control. Under it sits ONE collapsible row that
      // carries the group's links as its sub-menu — so a section reads as
      //   «کار روزانه»  (hint)
      //     ▸ کار روزانه  (the only menu row)
      //         ثبت سفارش / میز کار / …
      // A section with a single plain link («پیشخوان») is not worth a wrapper: collapsing
      // one destination only adds a click.
      const wrapped: NavMainItem[] =
        items.length === 1 && !items[0].items?.length
          ? [{ ...items[0], icon: items[0].icon ?? groupIcon }]
          : [
              {
                id: `group:${groupKey}`,
                title: groupLabel,
                url: items[0].url,
                icon: groupIcon,
                items,
              },
            ]

      result.push({
        groupKey,
        groupLabel,
        items: wrapped,
        icon: groupIcon,
        collapsible: sec.collapsible !== false,
        defaultOpen: groupDefaultOpenForRole(sec, role),
        mobilePriority: sec.mobilePriority,
      })
    }

    return result
  }, [activations, pathname, t, capabilities, roleAcl, hidePortal, siteType, role])

  return { navSections, activations, isLoading: isLoading || authQ.isLoading }
}
