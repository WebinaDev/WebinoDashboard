"use client"

import { useQuery } from "@tanstack/react-query"
import { ExternalLink, Maximize, Minimize, MoreVertical } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { useEffect, useMemo, useState, type ReactNode } from "react"

import { CloseMobileSidebarOnNavigate } from "@/components/CloseMobileSidebarOnNavigate"
import { ImpersonationBar } from "@/components/ImpersonationBar"
import { DashboardPrefetch } from "@/components/DashboardPrefetch"
import { LicenseGate } from "@/components/LicenseGate"
import { NotificationBell } from "@/components/NotificationBell"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { useDashboardNav } from "@/hooks/useDashboardNav"
import { useLocaleSync } from "@/hooks/useLocaleSync"
import { resolveAdminRoute } from "@/kernel/route-resolver"
import { DASHBOARD_BASE, stripDashboardBase } from "@/kernel/paths"
import { normalizeAccent } from "@/lib/accent"
import { api } from "@/lib/api"
import { htmlDir, sidebarSide } from "@/lib/locale"
import { DashboardPwaHead } from "@/components/pwa/DashboardPwaHead"
import { PwaInstallBanner } from "@/components/pwa/PwaInstallBanner"
import { PwaSplashOverlay } from "@/components/pwa/PwaSplashOverlay"
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister"
import { mergePwaSettings, resolvePwaBootstrap, type PwaStoredSettings } from "@/lib/pwa-settings"
import { useThemeSettings } from "@/providers/AppProviders"

type TenantBranding = {
  logo_url?: string | null
  logo_dark_url?: string | null
  favicon_url?: string | null
  accent?: string | null
  font?: string | null
  font_body?: string | null
  font_heading?: string | null
  font_ui?: string | null
  pwa?: PwaStoredSettings | null
}

type UserDto = {
  id: number
  name: string
  email: string
  role?: string | null
  ui_preferences?: {
    locale?: string | null
    theme?: string | null
    accent?: string | null
  } | null
  tenant?: {
    id: number
    name: string
    slug: string
    domain?: string | null
    branding?: TenantBranding | null
  }
}

export default function DashboardLayoutPage({
  children,
}: {
  children: ReactNode
}) {
  const tNav = useTranslations("nav")
  const tDashboard = useTranslations("dashboard")
  const tCommon = useTranslations("common")
  const tSidebar = useTranslations("sidebar")
  const locale = useLocale()
  const pathname = usePathname() ?? ""
  const { navSections, isLoading: navLoading } = useDashboardNav()
  const { applyServerPreferences, accent } = useThemeSettings()

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

  useEffect(() => {
    const prefs = user?.ui_preferences
    if (!prefs) return
    applyServerPreferences({ theme: prefs.theme, accent: prefs.accent })
    if (prefs.locale === "fa" || prefs.locale === "en") {
      document.cookie = `NEXT_LOCALE=${prefs.locale};path=/;max-age=31536000`
      localStorage.setItem("locale", prefs.locale)
      document.documentElement.lang = prefs.locale
      document.documentElement.dir = htmlDir(prefs.locale)
    }
  }, [user?.ui_preferences, applyServerPreferences])

  useEffect(() => {
    const branding = user?.tenant?.branding
    if (!branding) return
    const root = document.documentElement
    const body = branding.font_body || branding.font
    const heading = branding.font_heading || branding.font
    const ui = branding.font_ui || branding.font
    if (body) root.style.setProperty("--wd-font-body", body)
    if (heading) root.style.setProperty("--wd-font-heading", heading)
    if (ui) root.style.setProperty("--wd-font-ui", ui)
    const userAccent = user?.ui_preferences?.accent
    if (!userAccent && branding.accent) {
      root.setAttribute("data-accent", normalizeAccent(branding.accent))
    }
  }, [user?.tenant?.branding, user?.ui_preferences?.accent, accent])

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
  const tenantDomain = user?.tenant?.domain?.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "")
  const siteUrl = tenantDomain ? `https://${tenantDomain}` : null
  const logoUrl =
    user?.tenant?.branding?.logo_url ||
    user?.tenant?.branding?.logo_dark_url ||
    "/brand/logo.png"

  const pwaBootstrap = useMemo(() => {
    const branding = user?.tenant?.branding
    return resolvePwaBootstrap({
      locale,
      siteName: user?.tenant?.name,
      faviconUrl: branding?.favicon_url,
      pwa: mergePwaSettings(branding?.pwa),
    })
  }, [locale, user?.tenant?.branding, user?.tenant?.name])

  const breadcrumbCurrent = useMemo(() => {
    const segments = stripDashboardBase(pathname)
      .split("/")
      .filter(Boolean)
    const route = resolveAdminRoute(segments)
    if (!route) {
      return tDashboard("breadcrumb_current")
    }
    const key = route.labelKey.replace("nav.", "")
    try {
      return tNav(key as never)
    } catch {
      return tDashboard("breadcrumb_current")
    }
  }, [pathname, tDashboard, tNav])

  useEffect(() => {
    const site = tenantLabel !== "…" ? tenantLabel : tCommon("appName")
    document.title = `${breadcrumbCurrent} · ${site}`
  }, [breadcrumbCurrent, tenantLabel, tCommon])

  const builderEditor = /\/builder\/.+/.test(pathname)
  if (builderEditor) {
    return (
      <div className="flex h-svh flex-col overflow-hidden bg-[#e8eef5]">
        <ImpersonationBar />
        <div className="min-h-0 flex-1 overflow-hidden">
          <LicenseGate>{children}</LicenseGate>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col">
      <ImpersonationBar />
      <SidebarProvider className="min-h-0 w-full flex-1">
      {pwaBootstrap.enabled ? (
        <>
          <DashboardPwaHead pwa={pwaBootstrap} />
          <ServiceWorkerRegister pwa={pwaBootstrap} />
          <PwaSplashOverlay pwa={pwaBootstrap} />
          <PwaInstallBanner pwa={pwaBootstrap} variant="shell" />
        </>
      ) : null}
      <CloseMobileSidebarOnNavigate />
      <DashboardPrefetch />
      <AppSidebar
        side={sidebarSide(locale)}
        navSections={navSections}
        navLoading={navLoading}
        user={{
          name: user?.name ?? "…",
          email: user?.email ?? "…",
        }}
        tenantLabel={tenantLabel}
        tenantLogoSrc={logoUrl}
        tenantPlanLabel={tSidebar("plan_tenant")}
      />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 backdrop-blur-md transition-[width,height] ease-linear supports-[backdrop-filter]:bg-background/70 group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 sm:h-16">
          <div className="flex w-full min-w-0 items-center gap-2 px-3 sm:px-4">
            <SidebarTrigger className="-ms-1" data-testid="sidebar-trigger" />
            <Separator
              orientation="vertical"
              className="me-2 hidden data-[orientation=vertical]:h-4 sm:block"
            />
            <Breadcrumb className="min-w-0 flex-1 overflow-hidden">
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href={DASHBOARD_BASE}>
                    {tDashboard("breadcrumb_home")}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block">
                  {locale === "fa" ? (
                    <span dir="ltr" className="inline-block px-0.5">
                      {">"}
                    </span>
                  ) : undefined}
                </BreadcrumbSeparator>
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
              <NotificationBell />
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
              {siteUrl ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="hidden md:inline-flex"
                  asChild
                >
                  <a
                    href={siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={tDashboard("visit_site")}
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              ) : null}
              <div className="hidden md:block">
                <LocaleThemeToolbar />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="md:hidden"
                    aria-label={tDashboard("more_actions")}
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => void toggleFullscreen()}>
                    {fullscreen
                      ? tDashboard("exit_fullscreen")
                      : tDashboard("fullscreen")}
                  </DropdownMenuItem>
                  {siteUrl ? (
                    <DropdownMenuItem asChild>
                      <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                        {tDashboard("visit_site")}
                      </a>
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    onClick={() => {
                      const next = locale === "fa" ? "en" : "fa"
                      document.cookie = `NEXT_LOCALE=${next};path=/;max-age=31536000`
                      localStorage.setItem("locale", next)
                      void api("/api/v1/account/preferences", {
                        method: "PATCH",
                        json: { locale: next },
                      }).catch(() => {})
                      window.location.reload()
                    }}
                  >
                    {locale === "fa" ? tCommon("locale_en") : tCommon("locale_fa")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>
        <div className="@container/main wd-app-atmosphere flex min-w-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4">
          <LicenseGate>{children}</LicenseGate>
        </div>
        <footer className="mt-auto border-t px-4 py-3 text-muted-foreground text-xs">
          <p className="text-center md:text-start">{tenantLabel}</p>
        </footer>
      </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
