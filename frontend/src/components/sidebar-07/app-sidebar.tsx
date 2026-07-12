"use client"

import * as React from "react"
import { GalleryVerticalEnd, type LucideIcon } from "lucide-react"

import type { NavSection } from "@/hooks/useDashboardNav"
import { NavMain } from "@/components/sidebar-07/nav-main"
import { NavProjects } from "@/components/sidebar-07/nav-projects"
import { NavUser } from "@/components/sidebar-07/nav-user"
import { TeamSwitcher } from "@/components/sidebar-07/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

export function AppSidebar({
  navSections,
  projects = [],
  projectsGroupLabel,
  user,
  tenantLabel,
  tenantPlanLabel,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  navSections: NavSection[]
  projects?: {
    name: string
    url: string
    icon: LucideIcon
  }[]
  projectsGroupLabel: string
  user: {
    name: string
    email: string
    avatar?: string
  }
  tenantLabel: string
  tenantPlanLabel: string
}) {
  const teams = [
    {
      name: tenantLabel,
      logo: GalleryVerticalEnd,
      plan: tenantPlanLabel,
    },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
      </SidebarHeader>
      <SidebarContent>
        {navSections.map((section, index) => (
          <NavMain
            key={`${section.groupLabel}-${index}`}
            items={section.items}
            groupLabel={section.groupLabel}
          />
        ))}
        <NavProjects projects={projects} groupLabel={projectsGroupLabel} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
