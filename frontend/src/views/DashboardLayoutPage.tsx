"use client"

import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import type { ReactNode } from "react"

import { AppSidebar } from "@/components/sidebar-07/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { LocaleThemeToolbar } from "@/components/LocaleThemeToolbar"
import { api } from "@/lib/api"
import { sidebarSide } from "@/lib/locale"
import { useDashboardNav } from "@/hooks/useDashboardNav"
import { useLocaleSync } from "@/hooks/useLocaleSync"

type UserDto = {
  id: number
  name: string
  email: string
  tenant?: { id: number; name: string; slug: string }
}

export default function DashboardLayoutPage({
  children,
}: {
  children: ReactNode
}) {
  const tNav = useTranslations("nav")
  const tDashboard = useTranslations("dashboard")
  const tSidebar = useTranslations("sidebar")
  const locale = useLocale()
  const { navSections } = useDashboardNav()

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: () => api<UserDto>("/api/v1/auth/user"),
  })

  useLocaleSync()

  const tenantLabel = user?.tenant?.name ?? "…"

  return (
    <SidebarProvider>
      <AppSidebar
        side={sidebarSide(locale)}
        navSections={navSections}
        projects={[]}
        projectsGroupLabel={tNav("projects")}
        user={{
          name: user?.name ?? "…",
          email: user?.email ?? "…",
        }}
        tenantLabel={tenantLabel}
        tenantPlanLabel={tSidebar("plan_tenant")}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex flex-1 items-center gap-2 px-4">
            <SidebarTrigger className="-ms-1" />
            <Separator orientation="vertical" className="me-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/admin">
                    {tDashboard("breadcrumb_building")}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{tDashboard("breadcrumb_current")}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ms-auto">
              <LocaleThemeToolbar />
            </div>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
