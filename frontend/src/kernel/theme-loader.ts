import type { ComponentType } from "react"

import type { ResolvedAdminRoute, ResolvedSiteRoute } from "./types"
import type { SiteChromeProps } from "@/themes/shared/types"

type ThemeModule = {
  SiteHeader: ComponentType<SiteChromeProps>
  SiteFooter: ComponentType<{ siteName: string }>
}

const THEME_LOADERS: Record<string, () => Promise<ThemeModule>> = {
  "ecommerce-starter": () => import("@/themes/ecommerce-starter"),
  "ecommerce-default": () => import("@/themes/ecommerce-default"),
  "ecommerce-demo-v1": () => import("@/themes/ecommerce-demo-v1"),
  "magazine-default": () => import("@/themes/magazine-default"),
  "magazine-demo-v1": () => import("@/themes/magazine-demo-v1"),
  "cafe-starter": () => import("@/themes/cafe-starter"),
  "cafe-default": () => import("@/themes/cafe-default"),
  "cafe-demo-v1": () => import("@/themes/cafe-demo-v1"),
  "resume-default": () => import("@/themes/resume-default"),
  "resume-demo-v1": () => import("@/themes/resume-demo-v1"),
  "corporate-default": () => import("@/themes/corporate-default"),
  "corporate-demo-v1": () => import("@/themes/corporate-demo-v1"),
}

export async function loadThemeComponents(themeSlug: string): Promise<ThemeModule> {
  const loader = THEME_LOADERS[themeSlug] ?? THEME_LOADERS["corporate-default"]
  return loader()
}

export async function loadAdminPage(
  route: ResolvedAdminRoute,
): Promise<ComponentType<{ route: ResolvedAdminRoute }>> {
  const mod = await import(
    `../../modules/${route.moduleSlug}/admin/${route.submodule}-page`
  )
  return mod.default
}

export async function loadSitePage(
  route: ResolvedSiteRoute,
): Promise<ComponentType<{ route: ResolvedSiteRoute; searchParams?: Record<string, string | undefined> }>> {
  if (route.path === "") {
    const mod = await import("@/kernel/pages/SiteHomePage")
    return mod.default
  }
  const mod = await import(
    `../../modules/${route.moduleSlug}/site/${route.submodule}-page`
  )
  return mod.default
}
