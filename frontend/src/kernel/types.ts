export type SiteTypeSlug = "ecommerce" | "magazine" | "cafe" | "resume" | "corporate"

export type ModuleManifest = {
  slug: string
  nameFa: string
  nameEn: string
  distribution?: "bundled" | "git"
  siteTypes: SiteTypeSlug[]
  submodules: string[]
  adminNav?: { section: string; order: number }
  publicRoutes?: string[]
  adminRoutes: AdminRouteDef[]
  siteRoutes: SiteRouteDef[]
}

export type AdminRouteDef = {
  path: string
  submodule: string
  /** Admin page file stem under modules/{slug}/admin/{page}-page. Defaults to submodule. */
  page?: string
  labelKey: string
  section: string
  order?: number
  /** Keep route resolvable but omit from sidebar nav (storefront-only pages). */
  navHidden?: boolean
}

export type SiteRouteDef = {
  path: string
  submodule: string
  labelKey: string
}

export type KernelRegistry = {
  modules: ModuleManifest[]
  siteTypes: {
    slug: SiteTypeSlug
    name_fa: string
    name_en: string
    default_theme_slug: string
  }[]
}

export type TenantActivation = {
  module_slug: string
  submodule_slug: string
  enabled: boolean
  /** When false, module is entitlement-blocked even if enabled locally. */
  licensed?: boolean
}

export type ResolvedAdminRoute = AdminRouteDef & {
  moduleSlug: string
  fullPath: string
  /** Captured values for `:param` segments in the matched route path. */
  params?: Record<string, string>
}

export type ResolvedSiteRoute = SiteRouteDef & {
  moduleSlug: string
  fullPath: string
  /** Captured values for `:param` segments in the matched route path. */
  params?: Record<string, string>
}
