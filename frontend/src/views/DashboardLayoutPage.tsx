"use client"

import { useQuery } from "@tanstack/react-query"
import { ExternalLink, Maximize, Minimize } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { AppSidebar } from "@/components/sidebar-07/app-sidebar"
import { LocaleThemeToolbar } from "@/components/LocaleThemeToolbar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useDashboardNav } from "@/hooks/useDashboardNav"
import { useLocaleSync } from "@/hooks/useLocaleSync"
import { resolveAdminRoute } from "@/kernel/route-resolver"
import { api } from "@/lib/api"
import { sidebarSide } from "@/lib/locale"

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
  const pathname = usePathname() ?? ""
  const { navSections, activations } = useDashboardNav()

  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: () => api<UserDto>("/api/v1/auth/user"),
  })

  useLocaleSync()

  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      /* ignore */
    }
  }

  const tenantLabel = user?.tenant?.name ?? "…"

  const breadcrumbCurrent = useMemo(() => {
    const segments = pathname
      .replace(/^\/admin\/?/, "")
      .split("/")
      .filter(Boolean)
    const route = resolveAdminRoute(segments, activations)
    if (!route) {
      return tDashboard("breadcrumb_current")
    }
    const key = route.labelKey.replace("nav.", "")
    try {
      return tNav(key as never)
    } catch {
      return tDashboard("breadcrumb_current")
    }
  }, [activations, pathname, tDashboard, tNav])

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
        <header className="flex h-14 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 sm:h-16">
          <div className="flex w-full min-w-0 items-center gap-2 px-3 sm:px-4">
            <SidebarTrigger className="-ms-1" data-testid="sidebar-trigger" />
            <Separator
              orientation="vertical"
              className="me-2 hidden data-[orientation=vertical]:h-4 sm:block"
            />
            <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/admin">
                    {tDashboard("breadcrumb_building")}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage
                    className="truncate"
                    data-testid="admin-breadcrumb-current"
                  >
                    {breadcrumbCurrent}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ms-auto flex items-center gap-1 md:gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="hidden md:inline-flex"
                aria-label={
                  fullscreen
                    ? tDashboard("exit_fullscreen")
                    : tDashboard("fullscreen")
                }
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? (
                  <Minimize className="size-4" />
                ) : (
                  <Maximize className="size-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="hidden md:inline-flex"
                asChild
              >
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={tDashboard("visit_site")}
                >
                  <ExternalLink className="size-4" />
                </a>
              </Button>
              <LocaleThemeToolbar />
            </div>
          </div>
        </header>
        <div className="@container/main wd-app-atmosphere flex min-w-0 flex-1 flex-col gap-3 p-3 pt-0 sm:gap-4 sm:p-4 sm:pt-0">
          {children}
        </div>
        <footer className="mt-auto border-t px-4 py-3 text-muted-foreground text-xs">
          <p className="text-center md:text-start">{tenantLabel}</p>
        </footer>
      </SidebarInset>
    </SidebarProvider>
  )
}
