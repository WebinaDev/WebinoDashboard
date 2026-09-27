"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import type { NavSection } from "@/hooks/useDashboardNav"
import { NavMain } from "@/components/sidebar-07/nav-main"
import { NavUser } from "@/components/sidebar-07/nav-user"
import { SiteBrand } from "@/components/sidebar-07/site-brand"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar({
  navSections,
  navLoading = false,
  user,
  tenantLabel,
  tenantLogoSrc,
  tenantPlanLabel,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  navSections: NavSection[]
  navLoading?: boolean
  user: {
    name: string
    email: string
    avatar?: string
  }
  tenantLabel: string
  tenantLogoSrc?: string | null
  tenantPlanLabel: string
}) {
  const t = useTranslations("sidebar")
  const onlyHome =
    !navLoading &&
    navSections.length <= 1 &&
    (navSections[0]?.items.length ?? 0) <= 1

  return (
    <Sidebar collapsible="icon" className="border-s" {...props}>
      <SidebarHeader>
        <SiteBrand name={tenantLabel} logoSrc={tenantLogoSrc} subtitle={tenantPlanLabel} />
      </SidebarHeader>
      <SidebarContent data-tour="sidebar-nav">
        {navLoading ? (
          <SidebarGroup>
            <SidebarMenu>
              {Array.from({ length: 6 }).map((_, i) => (
                <SidebarMenuItem key={i}>
                  <SidebarMenuSkeleton showIcon />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          navSections.map((section, index) => (
            <NavMain
              key={`${section.groupLabel}-${index}`}
              items={section.items}
              groupLabel={section.groupLabel}
            />
          ))
        )}
        {onlyHome ? (
          <p className="text-muted-foreground px-3 py-2 text-xs leading-relaxed">
            {t("footer_hint_home_only")}
          </p>
        ) : null}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
