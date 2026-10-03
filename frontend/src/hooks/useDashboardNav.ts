"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"

import { api } from "@/lib/api"
import { pathIsActive } from "@/lib/path-active"
import { resolveNavIcon } from "@/kernel/nav-icons"
import { buildAdminNav } from "@/kernel/route-resolver"
import type { TenantActivation } from "@/kernel/types"
import { STAFF_ROLES, useAuthUser, userHasCapability } from "@/components/PermissionGate"
import { useBootstrapQuery } from "@/hooks/useBootstrapQuery"

import type { NavMainItem } from "@/components/sidebar-07/nav-main"

export type NavSection = {
  groupLabel: string
  items: NavMainItem[]
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

  const { data: activations = [], isLoading } = useQuery({
    queryKey: ["kernel-activations"],
    queryFn: () => api<TenantActivation[]>("/api/v1/kernel/activations"),
  })

  const capabilities = authQ.data?.capabilities ?? bootstrapQ.data?.user?.capabilities
  const roleAcl = bootstrapQ.data?.menu_acl
  const role = authQ.data?.role ?? ""
  const hidePortal = (STAFF_ROLES as readonly string[]).includes(role)

  const navSections: NavSection[] = useMemo(() => {
    const sections = buildAdminNav(activations)
    const result: NavSection[] = []

    for (const sec of sections) {
      const items: NavMainItem[] = []
      for (const item of sec.items) {
        if (hidePortal && isCustomerPortalUrl(item.url)) continue
        if (item.capability && !userHasCapability(capabilities, item.capability)) continue
        if (!menuAllowed(item.menuKey, roleAcl)) continue

        const nested =
          item.items
            ?.filter((child) => {
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
      if (items.length > 0) {
        result.push({
          groupLabel: t(sec.labelKey.replace("nav.", "") as never),
          items,
        })
      }
    }

    return result
  }, [activations, pathname, t, capabilities, roleAcl, hidePortal])

  return { navSections, activations, isLoading: isLoading || authQ.isLoading }
}
