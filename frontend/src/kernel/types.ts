export type SiteTypeSlug = "ecommerce" | "magazine" | "cafe" | "resume" | "corporate"

export type ModuleManifest = {
  slug: string
  nameFa: string
  nameEn: string
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
  labelKey: string
  section: string
  order?: number
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
}

export type ResolvedAdminRoute = AdminRouteDef & {
  moduleSlug: string
  fullPath: string
}

export type ResolvedSiteRoute = SiteRouteDef & {
  moduleSlug: string
  fullPath: string
}
