export type SiteThemeManifest = {
  slug: string
  nameFa: string
  nameEn: string
  siteTypes: string[]
  isDemo: boolean
  preview: string
  sortOrder: number
}

export type SiteBranding = {
  logo_url: string | null
  logo_dark_url: string | null
  favicon_url: string | null
  accent: "zinc" | "slate" | "blue" | "green" | "rose" | "orange"
  font: "yekan-bakh" | "system"
}

export type SiteThemeCatalogItem = {
  slug: string
  name_fa: string
  name_en: string
  site_types: string[]
  is_demo: boolean
  preview: string
  sort_order: number
}

export type ThemeCatalogResponse = {
  site_type_slug: string | null
  active_theme_slug: string | null
  branding: SiteBranding
  themes: SiteThemeCatalogItem[]
  accents: SiteBranding["accent"][]
  fonts: SiteBranding["font"][]
}
