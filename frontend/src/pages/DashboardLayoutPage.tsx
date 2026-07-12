"use client"

import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation(["nav", "dashboard", "sidebar"])
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
        navSections={navSections}
        projects={[]}
        projectsGroupLabel={t("nav:projects")}
        user={{
          name: user?.name ?? "…",
          email: user?.email ?? "…",
        }}
        tenantLabel={tenantLabel}
        tenantPlanLabel={t("sidebar:plan_tenant")}
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
                    {t("dashboard:breadcrumb_building")}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{t("dashboard:breadcrumb_current")}</BreadcrumbPage>
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
